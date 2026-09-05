"""
مزاد+ — واجهة برمجية (Flask)
Mazad+ — REST API.

Run:  python app.py      (serves on http://127.0.0.1:5001)
"""
import gzip
import hashlib
import json
import os
import queue
import re
import secrets
import threading
import time
import traceback
import uuid
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Flask, Response, g, jsonify, request, send_from_directory
from sqlalchemy.orm import selectinload
from flask_cors import CORS

from models import (Auction, AuditLog, AuthRequest, Bid, Deposit, Document,
                    FraudAlert, Notification, Payment, Property, Session,
                    CityProfile, District, Encumbrance, MarketIndicator, PropertyPhoto, Report,
                    Setting, User, as_utc, db, iso, utcnow)
from services import (audit, flags as flags_engine, fraud, pricing, readiness,
                      registry, reports, value_matrix)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "mazad_plus.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
# Built frontend (frontend/dist). When present, Flask serves it so the whole
# platform is one process behind one URL — which is what a phone needs.
DIST_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend", "dist")
ALLOWED_IMAGE = {"jpg", "jpeg", "png", "webp"}
MAX_UPLOAD_MB = 12

AUTH_REQUEST_TTL_SECONDS = 120


# ---------------------------------------------------------------------------
# Live-bid event bus — one queue per connected browser, drained over SSE.
# The study's stack lists WebSocket for real-time auction updates; Server-Sent
# Events give the same server-push semantics for a one-way feed with no extra
# dependency, and degrade to a plain reconnect if the connection drops.
# ---------------------------------------------------------------------------
class EventBus:
    def __init__(self):
        self._subscribers = []
        self._lock = threading.Lock()

    def subscribe(self):
        q = queue.Queue(maxsize=64)
        with self._lock:
            self._subscribers.append(q)
        return q

    def unsubscribe(self, q):
        with self._lock:
            if q in self._subscribers:
                self._subscribers.remove(q)

    def publish(self, event, payload):
        message = f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
        with self._lock:
            targets = list(self._subscribers)
        for q in targets:
            try:
                q.put_nowait(message)
            except queue.Full:
                pass  # a stalled client must not slow the auction down


bus = EventBus()


def create_app():
    app = Flask(__name__, static_folder=None)
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DB_PATH}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JSON_AS_ASCII"] = False
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    db.init_app(app)
    CORS(app, supports_credentials=True)
    register_routes(app)
    return app


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:]
    session = db.session.get(Session, token)
    return session.user if session else None


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({"error": "unauthenticated",
                            "message": "الجلسة غير صالحة — يلزم الدخول عبر نفاذ"}), 401
        g.user = user
        return fn(*args, **kwargs)
    return wrapper


def roles_required(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if g.user.role not in roles:
                return jsonify({
                    "error": "forbidden",
                    "message": "هذا الإجراء يتطلب صلاحية " + " أو ".join(roles),
                }), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def setting(key, default=None):
    row = db.session.get(Setting, key)
    return row.value if row else default


def ip_fingerprint():
    """Pseudonymous network fingerprint.

    The raw address is never stored. It is salted and truncated, so it can be
    compared between bids (which is all the anomaly detector needs) without
    retaining an identifier that would re-identify a bidder.
    """
    raw = request.headers.get("X-Forwarded-For", request.remote_addr or "0.0.0.0")
    return hashlib.sha256(("mazad-plus-salt" + raw).encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
def register_routes(app):

    # -- ضغط الاستجابات وذاكرة التخزين -------------------------------------
    @app.after_request
    def compress_and_cache(resp):
        """Gzip JSON/text bodies and let browsers cache hashed build assets.

        The list endpoints run to several megabytes of JSON; over a tunnel to a
        phone that is the whole load time, and JSON gzips roughly 10:1.
        """
        if request.path.startswith("/assets/"):
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        ctype = resp.mimetype or ""
        if (resp.status_code == 200 and not resp.direct_passthrough
                and "gzip" in request.headers.get("Accept-Encoding", "")
                and (ctype.startswith("text/") or ctype in ("application/json", "application/javascript"))
                and "Content-Encoding" not in resp.headers):
            data = resp.get_data()
            if len(data) > 1024:
                resp.set_data(gzip.compress(data, compresslevel=5))
                resp.headers["Content-Encoding"] = "gzip"
                resp.headers["Vary"] = "Accept-Encoding"
        return resp

    # -- الواجهة المبنية ----------------------------------------------------
    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def spa(path):
        """Serve the built frontend with an SPA fallback. API routes win first."""
        if path.startswith("api/"):
            return jsonify({"error": "not_found"}), 404
        if not os.path.isdir(DIST_DIR):
            return jsonify({"error": "frontend_not_built",
                            "message": "ابنِ الواجهة أولاً: cd frontend && npm run build"}), 503
        target = os.path.join(DIST_DIR, path)
        if path and os.path.isfile(target):
            return send_from_directory(DIST_DIR, path)
        return send_from_directory(DIST_DIR, "index.html")

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "mazad-plus", "time": utcnow().isoformat()})

    # -- Nafath-simulated authentication ------------------------------------
    @app.post("/api/auth/nafath/initiate")
    def nafath_initiate():
        """Step 1 — national ID is matched against the local demo registry.

        This is a SIMULATION. Connecting to the real National Single Sign-On
        is not automatic: it needs an application, an integration agreement,
        and prior approval from the National Information Center.
        """
        data = request.get_json(silent=True) or {}
        national_id = str(data.get("nationalId", "")).strip()

        if not (len(national_id) == 10 and national_id.isdigit() and national_id[0] in "12"):
            return jsonify({
                "error": "invalid_id",
                "message": "رقم الهوية يجب أن يتكوّن من 10 أرقام ويبدأ بـ 1 (مواطن) أو 2 (مقيم)",
            }), 400

        user = User.query.filter_by(national_id=national_id).first()
        if not user:
            return jsonify({
                "error": "not_registered",
                "message": "هذا الرقم غير مسجّل في المخزن التجريبي للمنصة",
            }), 404

        code = f"{secrets.randbelow(90) + 10:02d}"
        decoys = set()
        while len(decoys) < 2:
            candidate = f"{secrets.randbelow(90) + 10:02d}"
            if candidate != code:
                decoys.add(candidate)

        req = AuthRequest(
            id=str(uuid.uuid4()),
            national_id=national_id,
            code=code,
            decoys=",".join(sorted(decoys)),
            expires_at=utcnow() + timedelta(seconds=AUTH_REQUEST_TTL_SECONDS),
        )
        db.session.add(req)
        db.session.commit()

        options = sorted([code, *decoys])
        return jsonify({
            "requestId": req.id,
            "code": code,          # shown on screen, as the real flow does
            "options": options,    # the three numbers the app would offer
            "expiresIn": AUTH_REQUEST_TTL_SECONDS,
            "maskedPhone": user.phone_masked,
        })

    @app.post("/api/auth/nafath/verify")
    def nafath_verify():
        """Step 2 — the "app" confirms. Issues a session token."""
        data = request.get_json(silent=True) or {}
        req = db.session.get(AuthRequest, str(data.get("requestId", "")))
        selected = str(data.get("selected", ""))

        if not req or req.status != "pending":
            return jsonify({"error": "invalid_request",
                            "message": "طلب التحقق غير صالح أو استُهلك"}), 400

        if as_utc(req.expires_at) < utcnow():
            req.status = "expired"
            db.session.commit()
            return jsonify({"error": "expired",
                            "message": "انتهت صلاحية الطلب — أعد المحاولة"}), 400

        if selected and selected != req.code:
            req.status = "rejected"
            db.session.commit()
            return jsonify({"error": "mismatch",
                            "message": "الرقم المختار غير مطابق — أعد المحاولة"}), 400

        user = User.query.filter_by(national_id=req.national_id).first()
        req.status = "approved"

        token = secrets.token_urlsafe(32)
        db.session.add(Session(token=token, user_id=user.id))
        audit.record(user.full_name, "human", "تسجيل دخول (محاكاة نفاذ)",
                     f"مطابقة ناجحة مع المخزن التجريبي · {user.role_label}",
                     entity=f"user:{user.id}")
        db.session.commit()

        return jsonify({"token": token, "user": user.to_dict()})

    @app.get("/api/auth/me")
    @login_required
    def me():
        return jsonify({"user": g.user.to_dict()})

    @app.put("/api/auth/profile")
    @login_required
    def update_profile():
        """Contact preferences only — name, role and ID stay bound to Nafath."""
        body = request.get_json(silent=True) or {}
        email = (body.get("email") or "").strip().lower()
        if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]{2,}", email):
            return jsonify({"error": "invalid_email",
                            "message": "صيغة البريد الإلكتروني غير صحيحة"}), 400
        g.user.email = email or None
        g.user.notify_email = bool(body.get("notifyEmail")) and bool(email)
        audit.record(g.user.full_name, "human", "تحديث بريد الإشعارات",
                     f"{g.user.email or 'بدون بريد'} · الإشعارات {'مفعّلة' if g.user.notify_email else 'متوقفة'}",
                     entity=f"user:{g.user.id}")
        db.session.commit()
        return jsonify({"user": g.user.to_dict()})

    @app.post("/api/auth/logout")
    @login_required
    def logout():
        token = request.headers.get("Authorization", "")[7:]
        session = db.session.get(Session, token)
        if session:
            db.session.delete(session)
            db.session.commit()
        return jsonify({"ok": True})

    @app.get("/api/auth/demo-identities")
    def demo_identities():
        """The seeded IDs, surfaced on the login screen so the demo is usable."""
        users = User.query.order_by(User.id).all()
        return jsonify({"identities": [
            {"nationalId": u.national_id, "fullName": u.full_name, "roleLabel": u.role_label}
            for u in users if u.role != "bidder"
        ]})

    @app.get("/api/public-stats")
    def public_stats():
        """Headline counts for the sign-in panel. No authentication, no PII."""
        return jsonify({
            "assets": Property.query.count(),
            "auctions": Auction.query.count(),
            "bids": Bid.query.count(),
            "platforms": 6,
        })

    # -- Dashboard ----------------------------------------------------------
    @app.get("/api/dashboard")
    @login_required
    def dashboard():
        auctions = Auction.query.all()
        live = [a for a in auctions if a.status == "live"]
        upcoming = [a for a in auctions if a.status == "upcoming"]
        open_alerts = FraudAlert.query.filter(FraudAlert.state == "مفتوح").count()
        props = Property.query.all()

        listed_value = sum(a.current_price or a.opening_price or 0 for a in live + upcoming)
        blocked = [p for p in props if p.readiness_score < setting("readiness_threshold", 70)]
        avg_readiness = round(sum(p.readiness_score for p in props) / len(props)) if props else 0

        return jsonify({
            "stats": {
                "listedValue": listed_value,
                "liveAuctions": len(live),
                "upcomingAuctions": len(upcoming),
                "openAlerts": open_alerts,
                "blockedAssets": len(blocked),
                "avgReadiness": avg_readiness,
                "totalAssets": len(props),
            },
            "liveAuctions": [a.to_dict(with_property=True) for a in live],
            "notifications": [n.to_dict() for n in Notification.query
                              .order_by(Notification.created_at.desc()).limit(6)],
            # Documented market figures — sources listed in the study's references.
            "market": {
                "aggregates": _published_aggregates(),
                "infathH1Sales": 10_700_000_000,
                "infathH1Auctions": 814,
                "infathH1Assets": 3089,
                "accreditedPlatforms": 6,
                "falAuctionLicenses": 1202,
                "licensesByRegion": [
                    {"region": "الرياض", "count": 527},
                    {"region": "مكة المكرمة", "count": 310},
                    {"region": "الشرقية", "count": 130},
                    {"region": "بقية المناطق", "count": 235},
                ],
                "source": "بيان إنفاذ الرسمي 9 أغسطس 2026 · صفحة شركاء إنفاذ · "
                          "عدّ موثّق عبر خدمة الاستعلام، الهيئة العامة للعقار 30-08-2026",
            },
        })

    # -- Properties ---------------------------------------------------------
    @app.get("/api/properties")
    @login_required
    def list_properties():
        threshold = setting("readiness_threshold", 70)
        props = (Property.query.options(selectinload(Property.documents))
                 .order_by(Property.ref).all())
        # Table rows need document *counts*, not the documents — the full
        # payload was 5 MB for 1,600 assets.
        rows = []
        for p in props:
            required = [d for d in p.documents if d.required]
            rows.append({**p.to_dict(with_docs=False),
                         "eligible": p.readiness_score >= threshold,
                         "docsRequired": len(required),
                         "docsPresent": sum(1 for d in required if d.present)})
        return jsonify({"threshold": threshold, "properties": rows})

    @app.get("/api/properties/<ref>")
    @login_required
    def get_property(ref):
        p = Property.query.filter_by(ref=ref).first_or_404()
        auction = Auction.query.filter_by(property_id=p.id).first()
        return jsonify({
            "property": p.to_dict(),
            "threshold": setting("readiness_threshold", 70),
            "auctionCode": auction.code if auction else None,
            "recommendation": pricing.recommend(p),
            "pricingBlockedBy": pricing.unavailable_reason(p),
        })

    @app.post("/api/properties/<ref>/documents/<int:doc_id>/toggle")
    @login_required
    @roles_required("agent", "compliance")
    def toggle_document(ref, doc_id):
        """Mark a required document as received (or not) and rescore.

        This is what an agent actually does to unblock an asset, so the demo
        lets you do it and watch the score and the block move.
        """
        p = Property.query.filter_by(ref=ref).first_or_404()
        doc = db.session.get(Document, doc_id)
        if not doc or doc.property_id != p.id:
            return jsonify({"error": "not_found"}), 404

        doc.present = not doc.present
        doc.uploaded_at = utcnow() if doc.present else None
        before = p.readiness_score
        score, _ = readiness.recompute(p)
        pricing.apply(p)

        audit.record(g.user.full_name, "human", "تحديث مستند أصل",
                     f"{p.ref} — {doc.label}: "
                     + ("مرفوع" if doc.present else "أُزيل")
                     + f" · درجة الجاهزية {before} ← {score}",
                     entity=f"property:{p.ref}")
        audit.record("مزاد+ (محرك الجاهزية)", "ai", "إعادة احتساب درجة الجاهزية",
                     f"{p.ref} — {score}/100", entity=f"property:{p.ref}")
        _sync_auction_status(p)
        db.session.commit()
        return jsonify({"property": p.to_dict(),
                        "recommendation": pricing.recommend(p),
                        "pricingBlockedBy": pricing.unavailable_reason(p)})

    @app.post("/api/properties/<ref>/pricing/decision")
    @login_required
    @roles_required("appraiser")
    def price_decision(ref):
        """The mandatory human-in-the-loop gate on every price recommendation.

        An AI price never becomes an opening price on its own. Approving or
        overriding it is a named act, and an override cannot be submitted
        without a reason.
        """
        p = Property.query.filter_by(ref=ref).first_or_404()
        data = request.get_json(silent=True) or {}
        decision = data.get("decision")
        reason = (data.get("reason") or "").strip()

        if decision not in ("approve", "override"):
            return jsonify({"error": "bad_decision"}), 400
        if decision == "override" and not reason:
            return jsonify({
                "error": "reason_required",
                "message": "تعديل التوصية يتطلب تسجيل السبب",
            }), 400

        if decision == "override":
            new_low = data.get("low")
            new_high = data.get("high")
            if new_low and new_high:
                p.price_low, p.price_high = float(new_low), float(new_high)
            p.price_status = "overridden"
            p.price_decision_reason = reason
            detail = (f"{p.ref} — تعديل النطاق إلى "
                      f"{p.price_low:,.0f}–{p.price_high:,.0f} ر.س · السبب: {reason}")
        else:
            p.price_status = "approved"
            p.price_decision_reason = None
            detail = f"{p.ref} — اعتماد النطاق {p.price_low:,.0f}–{p.price_high:,.0f} ر.س كما هو"

        p.price_decided_by = g.user.id
        p.price_decided_at = utcnow()

        auction = Auction.query.filter_by(property_id=p.id).first()
        if auction and auction.status in ("draft", "blocked", "upcoming"):
            auction.opening_price = p.price_low
            auction.current_price = auction.current_price or p.price_low

        audit.record(g.user.full_name, "human",
                     "اعتماد توصية السعر" if decision == "approve" else "تعديل توصية السعر",
                     detail, entity=f"property:{p.ref}")
        db.session.commit()
        return jsonify({"property": p.to_dict()})

    # -- Auctions -----------------------------------------------------------
    _list_cache = {}

    @app.get("/api/auctions")
    @login_required
    def list_auctions():
        status = request.args.get("status") or "all"
        # The auctions page polls every 8 s; a 4 s cache means at most one
        # rebuild per poll cycle instead of one per client.
        hit = _list_cache.get(status)
        if hit and time.time() - hit[0] < 4:
            return Response(hit[1], mimetype="application/json")
        q = Auction.query.options(
            selectinload(Auction.bids),
            selectinload(Auction.property).selectinload(Property.photos),
        )
        if status != "all":
            q = q.filter_by(status=status)
        auctions = q.all()
        order = {"live": 0, "upcoming": 1, "blocked": 2, "draft": 3, "closed": 4}
        auctions.sort(key=lambda a: (order.get(a.status, 9), a.ends_at or utcnow()))
        counts = {st: n for st, n in
                  db.session.query(Auction.status, db.func.count()).group_by(Auction.status)}
        counts["all"] = sum(counts.values())
        # List payload: cards need the property summary, not its documents and
        # photo list — with 1,600+ auctions that difference is ~5 MB per load.
        body = json.dumps({"auctions": [_slim_auction(a) for a in auctions], "counts": counts},
                          ensure_ascii=False)
        _list_cache[status] = (time.time(), body)
        return Response(body, mimetype="application/json")

    @app.get("/api/auctions/<code>")
    @login_required
    def get_auction(code):
        a = Auction.query.filter_by(code=code).first_or_404()
        alerts = FraudAlert.query.filter_by(auction_id=a.id).all()
        return jsonify({
            "auction": a.to_dict(with_bids=True),
            "recommendation": pricing.recommend(a.property),
            "pricingBlockedBy": pricing.unavailable_reason(a.property),
            "alerts": [al.to_dict() for al in alerts],
            "settings": {s.key: s.value for s in Setting.query.all()},
        })

    @app.post("/api/auctions/<code>/bids")
    @login_required
    def place_bid(code):
        """Place a bid. Enforces the configured minimum increment.

        Note what is absent: there is no late-payment fee, anywhere. Default
        by a winning bidder is handled by forfeiting the pre-agreed deposit,
        cancelling the award, or suspending the account — never by charging
        a surcharge on a due amount, which is Riba.
        """
        a = Auction.query.filter_by(code=code).first_or_404()
        if a.status != "live":
            return jsonify({"error": "not_live",
                            "message": "المزاد غير مفتوح للمزايدة حالياً"}), 400

        data = request.get_json(silent=True) or {}
        try:
            amount = float(data.get("amount"))
        except (TypeError, ValueError):
            return jsonify({"error": "bad_amount"}), 400

        floor = (a.current_price or a.opening_price or 0)
        increment_pct = setting("min_increment_pct", 1) / 100
        min_next = floor + max(a.min_increment or 0, floor * increment_pct)
        if amount < min_next:
            return jsonify({
                "error": "below_increment",
                "message": f"الحد الأدنى للمزايدة التالية {min_next:,.0f} ر.س",
                "minNext": min_next,
            }), 400

        # A deposit must be disclosed and acknowledged before the first bid.
        deposit = Deposit.query.filter_by(auction_id=a.id, user_id=g.user.id).first()
        if not deposit or not deposit.disclosure_accepted_at:
            return jsonify({
                "error": "deposit_required",
                "message": "يلزم الإقرار بشروط العربون قبل أول مزايدة",
                "depositAmount": a.deposit_amount,
            }), 409

        alias = f"م-{g.user.id:03d}"
        bid = Bid(auction_id=a.id, bidder_user_id=g.user.id, bidder_alias=alias,
                  amount=amount, ip_hash=ip_fingerprint())
        a.current_price = amount
        db.session.add(bid)
        db.session.flush()

        audit.record(alias, "human", "مزايدة", f"{a.code} — {amount:,.0f} ر.س",
                     entity=f"auction:{a.code}")
        _rescan_fraud(a)
        db.session.commit()

        bus.publish("bid", {"auction": a.code, "bid": bid.to_dict(),
                            "currentPrice": a.current_price})
        return jsonify({"bid": bid.to_dict(), "currentPrice": a.current_price})

    @app.post("/api/auctions/<code>/deposit/accept")
    @login_required
    def accept_deposit(code):
        """Logged acknowledgement of the deposit terms before bidding.

        The Arbun is permissible on the condition of an explicit prior
        agreement on the amount, the deadline, and that it goes to the seller
        if the buyer does not complete. So the acknowledgement is recorded as
        evidence, not buried in terms and conditions.
        """
        a = Auction.query.filter_by(code=code).first_or_404()
        deposit = Deposit.query.filter_by(auction_id=a.id, user_id=g.user.id).first()
        if not deposit:
            deposit = Deposit(auction_id=a.id, user_id=g.user.id, amount=a.deposit_amount)
            db.session.add(deposit)
        deposit.disclosure_accepted_at = utcnow()

        db.session.add(Payment(auction_id=a.id, user_id=g.user.id,
                               amount=a.deposit_amount, kind="deposit", status="settled",
                               settled_at=utcnow()))
        audit.record(g.user.full_name, "human", "إقرار بشروط العربون",
                     f"{a.code} — عربون {a.deposit_amount:,.0f} ر.س · "
                     f"{setting('deposit_cap_pct', 5):.0f}% من القيمة التقديرية",
                     entity=f"auction:{a.code}")
        db.session.commit()
        return jsonify({"ok": True, "depositAmount": a.deposit_amount})

    @app.get("/api/auctions/<code>/stream")
    def stream(code):
        """Server-Sent Events feed of live bids for one auction."""
        q = bus.subscribe()

        def generate():
            try:
                yield "retry: 3000\n\n"
                while True:
                    try:
                        yield q.get(timeout=20)
                    except queue.Empty:
                        yield ": keep-alive\n\n"
            finally:
                bus.unsubscribe(q)

        return Response(generate(), mimetype="text/event-stream",
                        headers={"Cache-Control": "no-cache",
                                 "X-Accel-Buffering": "no",
                                 "Connection": "keep-alive"})

    # -- Fraud alerts -------------------------------------------------------
    @app.get("/api/fraud-alerts")
    @login_required
    def list_alerts():
        alerts = FraudAlert.query.order_by(FraudAlert.id.desc()).all()
        return jsonify({"alerts": [a.to_dict() for a in alerts]})

    @app.post("/api/fraud-alerts/<code>/decision")
    @login_required
    @roles_required("compliance")
    def alert_decision(code):
        """Every alert is closed by a person, with the decision recorded."""
        alert = FraudAlert.query.filter_by(code=code).first_or_404()
        data = request.get_json(silent=True) or {}
        state = data.get("state")
        allowed = {
            "محال للمنافسة": "إحالة إلى الهيئة العامة للمنافسة",
            "قيد المراجعة": "فتح مراجعة بشرية موسّعة",
            "مغلق": "إغلاق التنبيه — لا شبهة كافية",
        }
        if state not in allowed:
            return jsonify({"error": "bad_state"}), 400

        alert.state = state
        alert.decided_by = g.user.id
        alert.decided_at = utcnow()
        audit.record(g.user.full_name, "human", "قرار على تنبيه نزاهة",
                     f"{alert.code} — {allowed[state]}", entity=f"alert:{alert.code}")
        db.session.commit()
        return jsonify({"alert": alert.to_dict()})

    # -- الخدمة ١: كشف الأصل قبل المزايدة -----------------------------------
    @app.get("/api/registry")
    @login_required
    def integration_register():
        """سجل التكامل — what each official connector needs to go live.

        Surfaced in the UI so the demo never implies a live government link,
        and so Chapter 15's asks are visible rather than buried in a document.
        """
        return jsonify({
            "connectors": registry.describe_all(),
            "chapter15Asks": registry.CHAPTER_15_ASKS,
            "assumptionChanges": registry.ASSUMPTION_CHANGES,
        })

    @app.get("/api/properties/<ref>/disclosure")
    @login_required
    def property_disclosure(ref):
        """Run the four registers live and return the flagged disclosure.

        Not persisted — this is the free look. Sealing it into a document is a
        separate, paid, audited act (see the issue route below).
        """
        p = Property.query.filter_by(ref=ref).first_or_404()
        auction = Auction.query.filter_by(property_id=p.id).first()
        payload = reports.build_disclosure(p, auction)

        audit.record(g.user.full_name, "human", "استعلام كشف أصل",
                     f"{p.ref} — {payload['summary']['red']} علم أحمر و"
                     f"{payload['summary']['amber']} برتقالي",
                     entity=f"property:{p.ref}")
        db.session.commit()
        return jsonify(payload)

    @app.post("/api/properties/<ref>/disclosure/issue")
    @login_required
    def issue_disclosure(ref):
        p = Property.query.filter_by(ref=ref).first_or_404()
        auction = Auction.query.filter_by(property_id=p.id).first()
        report = reports.issue(p, auction, "disclosure", g.user)
        audit.record(g.user.full_name, "human", "إصدار كشف أصل مختوم",
                     f"{report.code} — {p.ref} · بصمة {report.content_hash[:12]}",
                     entity=f"report:{report.code}")
        db.session.commit()
        return jsonify({"report": report.to_dict()})

    # -- الخدمة ٣: تقرير الإقفال --------------------------------------------
    @app.post("/api/auctions/<code>/closing-report")
    @login_required
    def issue_closing(code):
        """Freeze and seal the closing report for a concluded auction."""
        a = Auction.query.filter_by(code=code).first_or_404()
        if a.status != "closed":
            return jsonify({"error": "not_closed",
                            "message": "تقرير الإقفال يُصدر بعد الترسية فقط"}), 400

        existing = Report.query.filter_by(auction_code=code, kind="closing").first()
        if existing:
            return jsonify({"report": existing.to_dict(), "reused": True})

        report = reports.issue(a.property, a, "closing", g.user)
        audit.record(g.user.full_name, "human", "إصدار تقرير إقفال مختوم",
                     f"{report.code} — {code} · بصمة {report.content_hash[:12]}",
                     entity=f"report:{report.code}")
        db.session.commit()
        return jsonify({"report": report.to_dict()})

    @app.get("/api/reports")
    @login_required
    def list_reports():
        rows = Report.query.order_by(Report.id.desc()).limit(100).all()
        return jsonify({
            "reports": [r.to_dict() for r in rows],
            "pricing": {"disclosure": reports.PRICE_DISCLOSURE,
                        "closing": reports.PRICE_CLOSING,
                        "vatRate": reports.VAT_RATE},
        })

    @app.get("/api/reports/<code>")
    @login_required
    def get_report(code):
        r = Report.query.filter_by(code=code).first_or_404()
        return jsonify({
            "report": r.to_dict(with_payload=True),
            "integrity": reports.verify(r),
            "invoice": reports.invoice_for(r),
        })

    # -- صور الأصل ---------------------------------------------------------
    @app.get("/api/uploads/<path:filename>")
    def serve_upload(filename):
        return send_from_directory(UPLOAD_DIR, filename)

    @app.post("/api/properties/<ref>/photos")
    @login_required
    @roles_required("agent", "compliance")
    def upload_photos(ref):
        """Attach inspection photographs to an asset.

        This is where real imagery enters the platform: the sale agent uploads
        the inspection photos, and they are stored under the asset with the
        uploader's identity and an audit entry. Files are renamed to a random
        token so a filename never leaks anything about the owner.
        """
        p = Property.query.filter_by(ref=ref).first_or_404()
        files = request.files.getlist("photos")
        if not files:
            return jsonify({"error": "no_files", "message": "لم تُرفق أي صورة"}), 400

        saved = []
        base = len(p.photos)
        for i, f in enumerate(files):
            ext = (f.filename.rsplit(".", 1)[-1] if "." in f.filename else "").lower()
            if ext not in ALLOWED_IMAGE:
                return jsonify({"error": "bad_type",
                                "message": f"الصيغة غير مدعومة: {f.filename} — المسموح JPG/PNG/WebP"}), 400
            name = f"{p.ref}-{secrets.token_hex(8)}.{ext}"
            f.save(os.path.join(UPLOAD_DIR, name))
            photo = PropertyPhoto(property_id=p.id, kind="inspection", url=f"/api/uploads/{name}",
                                  caption=request.form.get("caption") or "صورة معاينة",
                                  sort=base + i, uploaded_by=g.user.id)
            db.session.add(photo)
            saved.append(photo)
        db.session.flush()
        audit.record(g.user.full_name, "human", "رفع صور معاينة",
                     f"{p.ref} — {len(saved)} صورة", entity=f"property:{p.ref}")
        db.session.commit()
        return jsonify({"photos": [ph.to_dict() for ph in p.photos]})

    @app.delete("/api/properties/<ref>/photos/<int:photo_id>")
    @login_required
    @roles_required("agent", "compliance")
    def delete_photo(ref, photo_id):
        p = Property.query.filter_by(ref=ref).first_or_404()
        ph = db.session.get(PropertyPhoto, photo_id)
        if not ph or ph.property_id != p.id:
            return jsonify({"error": "not_found"}), 404
        if ph.kind == "inspection" and ph.url.startswith("/api/uploads/"):
            try:
                os.remove(os.path.join(UPLOAD_DIR, ph.url.rsplit("/", 1)[-1]))
            except OSError:
                pass
        db.session.delete(ph)
        audit.record(g.user.full_name, "human", "حذف صورة", f"{p.ref} — صورة #{photo_id}",
                     entity=f"property:{p.ref}")
        db.session.commit()
        return jsonify({"photos": [x.to_dict() for x in p.photos]})

    # -- المتشابهات والمقارنة عبر المدن --------------------------------------
    @app.get("/api/properties/<ref>/similar")
    @login_required
    def similar_properties(ref):
        """Assets like this one, across cities, with every feature explained.

        "Similar" is defined on what a buyer would actually trade off: same
        sub-class, comparable area, comparable budget. Each returned row also
        carries the city's climate/elevation and the disclosure flag count, so
        the comparison answers "which one, and why" rather than "which is
        cheapest".
        """
        base = Property.query.filter_by(ref=ref).first_or_404()
        profiles = {c.city: c for c in CityProfile.query.all()}
        districts = {(d.city, d.name): d for d in District.query.all()}
        lo_a, hi_a = (base.area_sqm or 0) * 0.5, (base.area_sqm or 0) * 2.0
        bv = base.estimated_value or 0
        lo_v, hi_v = bv * 0.5, bv * 2.0

        rows = []
        for p in Property.query.filter(Property.asset_subtype == base.asset_subtype).all():
            if p.id != base.id:
                if base.area_sqm and p.area_sqm and not (lo_a <= p.area_sqm <= hi_a):
                    continue
                if bv and p.estimated_value and not (lo_v <= p.estimated_value <= hi_v):
                    continue
            a = Auction.query.filter_by(property_id=p.id).first()
            price = (a.current_price or a.opening_price) if a else None
            d = districts.get((p.city, p.district))
            prof = profiles.get(p.city)
            per_sqm = price / p.area_sqm if (price and p.area_sqm) else None
            bench = (d.built_sar_sqm or d.land_sar_sqm) if d else None
            flags = flags_engine.evaluate(p, registry.query_all(p))
            rows.append({
                "ref": p.ref, "title": p.title, "city": p.city, "district": p.district,
                "subtype": p.asset_subtype, "areaSqm": p.area_sqm,
                "lat": p.lat, "lng": p.lng, "parcel": p.parcel,
                "estimatedValue": p.estimated_value, "price": price,
                "auctionCode": a.code if a else None, "status": a.status if a else None,
                "endsAt": iso(a.ends_at) if a else None,
                "pricePerSqm": round(per_sqm) if per_sqm else None,
                "districtBenchmark": bench,
                "deviationPct": round((per_sqm - bench) / bench * 100, 1) if (per_sqm and bench) else None,
                "readiness": p.readiness_score,
                "redFlags": sum(1 for f in flags if f["level"] == "red"),
                "amberFlags": sum(1 for f in flags if f["level"] == "amber"),
                "climate": prof.climate if prof else None,
                "elevationM": prof.elevation_m if prof else None,
                "summerHighC": prof.summer_high_c if prof else None,
                "character": prof.character if prof else [],
                "photo": p.photos[0].url if p.photos else None,
                "isBase": p.id == base.id,
            })
        rows.sort(key=lambda r: (not r["isBase"], r["price"] or 1e12))
        return jsonify({
            "base": base.ref,
            "criteria": {"subtype": base.asset_subtype,
                         "areaRange": [lo_a, hi_a] if base.area_sqm else None,
                         "valueRange": [lo_v, hi_v]},
            "rows": rows,
            "features": [
                {"key": "price", "label": "السعر الحالي", "why": "أعلى مزايدة أو سعر الافتتاح — ما ستدفعه فعلاً، لا التقدير"},
                {"key": "pricePerSqm", "label": "ر.س/م²", "why": "يحيّد فرق المساحة بين العقارات فتقارن مثلاً بمثل"},
                {"key": "deviationPct", "label": "الانحراف عن وسيط الحي", "why": "سالب كبير = أرخص من صفقات الحي المسجّلة. قد يكون فرصة أو عيباً — افتح كشف الأصل"},
                {"key": "climate", "label": "المناخ والارتفاع", "why": "بارد/معتدل/حار وذروة الصيف — الأهم لاستراحة أو مصيف، ويؤثر في الطلب الموسمي"},
                {"key": "character", "label": "طابع المدينة", "why": "سياحي، زراعي، تجاري… يحدّد من سيشتري منك لاحقاً ومتى"},
                {"key": "readiness", "label": "الجاهزية", "why": "اكتمال المستندات والمعاينة — الأقل من الحد لا يُطرح أصلاً"},
                {"key": "flags", "label": "القيود", "why": "أعلام حمراء (رهن لطرف ثالث، إيجار طويل، نزاع) تنتقل معك بعد الترسية"},
            ],
        })

    # -- استعلام بالصك / السجل العيني -----------------------------------------
    @app.post("/api/inquiry")
    @login_required
    def deed_inquiry():
        """Look an asset up by deed number or real-estate identity.

        What is real here: the input validation, the match against this
        platform's own records, and the honest description of what the
        official registries would need. The deed lookup itself is NOT run
        against السجل العيني — every official service is verify-only and needs
        the owner's national ID alongside the deed, so a third party cannot
        search by deed alone. The button to the official portal is the honest
        path for that step.
        """
        data = request.get_json(silent=True) or {}
        raw = str(data.get("query", "")).strip().replace(" ", "")
        kind = "deed" if raw.isdigit() and len(raw) == 12 else \
               "identity" if raw.isdigit() and 8 <= len(raw) <= 11 else \
               "ref" if raw.upper().startswith("AST-") else None
        if not kind:
            return jsonify({"error": "bad_query",
                            "message": "أدخل رقم صك إلكتروني (12 رقماً)، أو الهوية العقارية (8–11 رقماً)، أو مرجع أصل AST-…"}), 400

        if kind == "deed":
            p = Property.query.filter_by(deed_number=raw).first()
        elif kind == "ref":
            p = Property.query.filter_by(ref=raw.upper()).first()
        else:
            p = None

        audit.record(g.user.full_name, "human", "استعلام بالصك",
                     f"{kind}:{raw[:4]}…{raw[-3:]} — " + ("وُجد " + p.ref if p else "لا تطابق"),
                     entity=f"property:{p.ref}" if p else None)
        db.session.commit()

        official = {
            "portal": "https://srem.moj.gov.sa/transactions-info",
            "note": ("الاستعلام الرسمي عن الصك في البورصة العقارية تحقّقٌ لا بحث: يشترط رقم هوية "
                     "المالك مع رقم الصك، فلا تستطيع منصة خاصة البحث برقم الصك وحده. الرابط يفتح "
                     "الخدمة الرسمية لتُكملها بنفسك."),
        }
        if not p:
            return jsonify({"kind": kind, "found": False, "official": official,
                            "message": "لا يوجد أصل بهذا الرقم في سجلات مزاد+. الأصول التجريبية أرقام صكوكها تظهر في بطاقاتها."})
        auction = Auction.query.filter_by(property_id=p.id).first()
        return jsonify({"kind": kind, "found": True, "official": official,
                        "property": p.to_dict(), "auctionCode": auction.code if auction else None,
                        "disclosure": reports.build_disclosure(p, auction)})

    # -- نموذج العمل والاشتراك ------------------------------------------------
    @app.get("/api/plans")
    @login_required
    def plans():
        """The four revenue sources, exactly as the deck states them.

        Everything is a fixed fee or a subscription. Nothing is a percentage of
        the hammer price or the transaction value — that is what keeps the
        platform outside the statutory definition of real-estate mediation.
        """
        return jsonify({
            "principle": "لا نسبة من قيمة الصفقة ولا عمولة تسويق عقارات — كل الرسوم ثابتة أو اشتراكات، حفاظاً على وضوح التكييف النظامي.",
            "sources": [
                {"key": "disclosure", "title": "استعلام ما قبل المزايدة", "audience": "للأفراد والمزايدين", "when": "من اليوم الأول",
                 "options": [{"name": "مرة واحدة", "price": reports.PRICE_DISCLOSURE, "unit": "ر.س / استعلام", "desc": "استعلام عن عقار واحد برقم الصك أو السجل العيني"},
                             {"name": "اشتراك شهري", "price": 79, "unit": "ر.س / شهر", "desc": "استعلامات غير محدودة طوال مدة الاشتراك"},
                             {"name": "اشتراك سنوي", "price": 690, "unit": "ر.س / سنة", "desc": "استعلامات غير محدودة — يوفّر 27%"}]},
                {"key": "closing", "title": "تقرير الإقفال", "audience": "للأفراد والمهتمين بالعقار", "when": "من اليوم الأول",
                 "options": [{"name": "نسخة واحدة", "price": reports.PRICE_CLOSING, "unit": "ر.س / تقرير", "desc": "تقرير عقار واحد — أساس التقييم ووقائع المزاد، مختوم"},
                             {"name": "اشتراك شهري", "price": 390, "unit": "ر.س / شهر", "desc": "تقارير غير محدودة طوال مدة الاشتراك"}]},
                {"key": "platform_fee", "title": "عمولة تشغيل المزاد", "audience": "لوكلاء البيع والمنصات", "when": "من اليوم الأول",
                 "options": [{"name": "رسم ثابت لكل أصل", "price": 15, "unit": "ر.س / أصل يُطرح", "desc": "لا نسبة من سعر الترسية ولا من قيمة الصفقة"},
                             {"name": "باقة الوكيل", "price": 800, "unit": "ر.س / شهر", "desc": "حتى 100 أصل"},
                             {"name": "باقة المنشأة", "price": 2000, "unit": "ر.س / شهر", "desc": "حتى 400 أصل، مستخدمون متعددون"}]},
                {"key": "insights", "title": "بيع الرؤى والبيانات", "audience": "للشركات العقارية والبنوك وشركات التقييم", "when": "بعد سنة تشغيل",
                 "options": [{"name": "ترخيص مؤسسي", "price": None, "unit": "حسب الطلب", "desc": "مؤشرات وتحليلات مجهّلة — لا بيانات خام. الأول منتجنا، والثاني ملك غيرنا."}]},
            ],
            "vatRate": reports.VAT_RATE,
        })

    # -- الخدمة ٢: الخريطة المقارنة -----------------------------------------
    # الفئات التي تغطّيها وسائط الأحياء المنشورة (وسائط صفقات سكنية)
    COMPARABLE_SUBTYPES = {"فيلا", "شقة", "عمارة", "أرض سكنية"}
    BUILT_SUBTYPES = {"فيلا", "شقة", "عمارة"}

    @app.get("/api/map")
    @login_required
    def map_data():
        """Districts, indicators, and every auction that can be placed on a map.

        `pricePerSqm` and the opportunity index are only computed where the
        district actually has a published price — an index built on a missing
        denominator would be the most confidently wrong number on the screen.
        """
        city = request.args.get("city")
        dq = District.query
        if city:
            dq = dq.filter_by(city=city)
        districts = dq.order_by(District.city, District.name).all()
        by_name = {(d.city, d.name): d for d in districts}

        auctions = (Auction.query.join(Property)
                    .filter(Property.lat.isnot(None))
                    .all())
        if city:
            auctions = [a for a in auctions if a.property.city == city]

        points = []
        for a in auctions:
            p = a.property
            price = a.current_price or a.opening_price
            d = by_name.get((p.city, p.district))
            per_sqm = (price / p.area_sqm) if (price and p.area_sqm) else None
            benchmark = (d.built_sar_sqm or d.land_sar_sqm) if d else None

            # The district medians are RESIDENTIAL transaction medians. Dividing
            # an agricultural hectare or a livestock lot by one produces a
            # confident-looking −90% that means nothing, so the index is only
            # computed for asset classes the benchmark actually covers.
            comparable = p.asset_subtype in COMPARABLE_SUBTYPES
            opportunity, no_index_reason, index_quality = None, None, None
            if not comparable:
                no_index_reason = (f"وسيط الحي سكني — لا يقارَن بـ«{p.asset_subtype}»")
            elif not benchmark:
                no_index_reason = "لا يوجد وسيط سعر منشور لهذا الحي"
            elif not price:
                no_index_reason = "لا سعر منشور لهذا المزاد"
            elif not per_sqm:
                no_index_reason = "لا توجد مساحة مسجّلة للأصل"
            else:
                opportunity = round((per_sqm - benchmark) / benchmark * 100, 1)
                # Published district medians are land/mixed in every city the
                # research covered (built_sar_sqm is null everywhere). A villa's
                # price over its plot area measured against that is a
                # building-vs-land comparison — informative, but it must not
                # wear the same red/green badge as a land-vs-land one.
                is_built = p.asset_subtype in BUILT_SUBTYPES
                index_quality = ("direct" if (not is_built or (d and d.built_sar_sqm))
                                 else "approximate")

            points.append({
                "code": a.code,
                "ref": p.ref,
                "title": p.title,
                "city": p.city,
                "district": p.district,
                "subtype": p.asset_subtype,
                "lat": p.lat,
                "lng": p.lng,
                "status": a.status,
                "price": price,
                "estimatedValue": p.estimated_value,
                "areaSqm": p.area_sqm,
                "priceStatus": "published" if price else "unpublished",
                "pricePerSqm": round(per_sqm) if per_sqm else None,
                "districtBenchmark": benchmark,
                "benchmarkSource": d.source if d else None,
                "benchmarkConfidence": d.confidence if d else None,
                "opportunityPct": opportunity,
                "indexQuality": index_quality,
                "noIndexReason": no_index_reason,
                "readiness": p.readiness_score,
                "endsAt": iso(a.ends_at),
                "photo": p.photos[0].url if p.photos else None,
                "parcel": p.parcel,
                "parcelSource": p.parcel_source,
            })

        cities = sorted({d.city for d in District.query.all()})
        return jsonify({
            "districts": [d.to_dict() for d in districts],
            "points": points,
            "cities": cities,
            "indicators": [m.to_dict() for m in MarketIndicator.query.all()],
            "cityProfiles": {c.city: c.to_dict() for c in CityProfile.query.all()},
            "comparableSubtypes": sorted(COMPARABLE_SUBTYPES),
            "note": (
                "الإحداثيات مشتقة من مراكز الأحياء لا من الصك — الصك يعطي حدوداً وأطوالاً "
                "لا إحداثيات، وكلها تقريبية. ووسائط الأحياء وسائط صفقات سكنية مسجّلة، "
                "فلا يُحتسب المؤشر إلا للفئات السكنية التي يغطّيها الوسيط فعلاً."
            ),
            "caveat": (
                "سعر افتتاح المزاد أدنى من السوق بحكم التصميم لا بحكم الفرصة، ووسيط الحي "
                "سعر صفقات مكتملة. لذلك الانحراف السالب متوقّع في كل مزاد، والانحراف "
                "الكبير قد يكون سببه عيب في الأصل أو قيد نظامي عليه لا فرصة شرائية — "
                "افتح «كشف الأصل» قبل أن تقرأه فرصة."
            ),
        })

    # -- Added-value matrix -------------------------------------------------
    @app.get("/api/value-matrix")
    @login_required
    def get_value_matrix():
        """القيمة المضافة مقارنة بالمنصات المعتمدة.

        Served from the API rather than hard-coded in the frontend so the claim
        set is one auditable list — the thing a committee will argue with.
        """
        data = value_matrix.payload()
        # Ground the "live in this build" column in what actually exists.
        data["evidence"] = {
            "properties": Property.query.count(),
            "auctions": Auction.query.count(),
            "closedAuctions": Auction.query.filter_by(status="closed").count(),
            "bids": Bid.query.count(),
            "alerts": FraudAlert.query.count(),
            "auditEntries": AuditLog.query.count(),
            "chain": audit.verify_chain(),
        }
        return jsonify(data)

    # -- Settings -----------------------------------------------------------
    @app.get("/api/settings")
    @login_required
    def get_settings():
        return jsonify({"settings": [s.to_dict() for s in Setting.query.all()]})

    @app.put("/api/settings/<key>")
    @login_required
    @roles_required("compliance")
    def update_setting(key):
        s = db.session.get(Setting, key)
        if not s:
            return jsonify({"error": "not_found"}), 404
        data = request.get_json(silent=True) or {}
        try:
            new_value = float(data.get("value"))
        except (TypeError, ValueError):
            return jsonify({"error": "bad_value"}), 400

        old = s.value
        s.value = new_value
        audit.record(g.user.full_name, "config", "تعديل معامل نظامي",
                     f"{s.title}: {old:g} ← {new_value:g} {s.unit}", entity=f"setting:{key}")

        # A changed threshold or deposit cap must take effect immediately —
        # that is the whole point of it being a parameter and not a constant.
        if key in ("readiness_threshold", "deposit_cap_pct"):
            for p in Property.query.all():
                _sync_auction_status(p)
        db.session.commit()
        return jsonify({"setting": s.to_dict()})

    # -- Audit --------------------------------------------------------------
    @app.get("/api/audit")
    @login_required
    def get_audit():
        limit = min(int(request.args.get("limit", 100)), 500)
        rows = AuditLog.query.order_by(AuditLog.id.desc()).limit(limit).all()
        return jsonify({"entries": [r.to_dict() for r in rows],
                        "chain": audit.verify_chain()})

    # -- Notifications ------------------------------------------------------
    @app.get("/api/notifications")
    @login_required
    def get_notifications():
        rows = (Notification.query.filter(
            (Notification.user_id == g.user.id) | (Notification.user_id.is_(None)))
            .order_by(Notification.created_at.desc()).limit(20).all())
        return jsonify({"notifications": [n.to_dict() for n in rows]})

    # -- helpers ------------------------------------------------------------
    def _slim_auction(a):
        d = a.to_dict(with_property=False)
        p = a.property
        d["property"] = {**p.to_dict(with_docs=False), "photo": p.photos[0].url if p.photos else None}
        return d

    def _published_aggregates():
        """Infath's own published totals, collected with sources (data/auctions_results.json)."""
        path = os.path.join(BASE_DIR, "data", "auctions_results.json")
        try:
            with open(path, encoding="utf-8") as fh:
                rows = json.load(fh).get("aggregates", [])
        except (OSError, ValueError):
            return []
        keep = [a for a in rows if a.get("total_value_sar") or a.get("assets_count")]
        keep.sort(key=lambda a: str(a.get("period", "")), reverse=True)
        return keep[:12]

    def _sync_auction_status(prop):
        """Keep an auction's blocked/unblocked state in step with readiness."""
        threshold = setting("readiness_threshold", 70)
        cap = setting("deposit_cap_pct", 5) / 100
        for a in prop.auctions:
            if prop.estimated_value:
                a.deposit_amount = round(prop.estimated_value * cap)
            if a.status in ("blocked", "draft", "upcoming"):
                a.status = "upcoming" if prop.readiness_score >= threshold else "blocked"

    def _rescan_fraud(auction):
        """Re-run the detectors after each bid, upserting alerts by pattern."""
        for finding in fraud.scan(auction):
            existing = FraudAlert.query.filter_by(
                auction_id=auction.id, pattern=finding["pattern"]).first()
            if existing:
                existing.signals = finding["signals"]
                existing.severity = finding["severity"]
                continue
            code = f"FA-{FraudAlert.query.count() + 101}"
            db.session.add(FraudAlert(
                code=code, auction_id=auction.id, pattern=finding["pattern"],
                title=finding["title"], severity=finding["severity"],
                signals=finding["signals"], note=finding["note"], state="مفتوح"))
            audit.record("مزاد+ (محرك النزاهة)", "ai", "تنبيه نمط مزايدة",
                         f"{code} — {finding['title']} في {auction.code} · أُحيل للمشرف",
                         entity=f"auction:{auction.code}")
            db.session.add(Notification(
                title=finding["title"],
                body=f"تنبيه {code} على المزاد {auction.code} — يحتاج مراجعة بشرية",
                tone="warning"))

    app._sync_auction_status = _sync_auction_status


# ---------------------------------------------------------------------------
# Background auction runner — drives the demo without anyone clicking.
# ---------------------------------------------------------------------------
def start_auction_runner(app):
    """Place competing bids on live auctions and close them when time runs out.

    This stands in for the other bidders on the platform, so a live auction
    behaves like one while you watch it.
    """
    aliases = ["م-101", "م-102", "م-103", "م-104", "م-105"]

    def loop():
        time.sleep(4)
        while True:
            try:
                with app.app_context():
                    now = utcnow()
                    for a in Auction.query.filter_by(status="live").all():
                        if as_utc(a.ends_at) <= now:
                            a.status = "closed"
                            top = max(a.bids, key=lambda b: b.amount, default=None)
                            if top:
                                a.winner_user_id = top.bidder_user_id
                                db.session.add(Payment(
                                    auction_id=a.id, user_id=top.bidder_user_id or 1,
                                    amount=a.current_price, kind="settlement", status="pending",
                                    due_at=now + timedelta(days=int(setting("payment_days", 10)))))
                            audit.record("مزاد+ (النظام)", "system", "إغلاق مزاد",
                                         f"{a.code} — سعر الترسية {a.current_price:,.0f} ر.س",
                                         entity=f"auction:{a.code}")
                            db.session.commit()
                            bus.publish("closed", {"auction": a.code,
                                                   "finalPrice": a.current_price})
                            continue

                        floor = a.current_price or a.opening_price or 0
                        if not floor:
                            continue  # no published price — nothing to bid against
                        step = max(a.min_increment or 1000, floor * 0.004)
                        amount = round((floor + step) / 1000) * 1000
                        alias = aliases[secrets.randbelow(len(aliases))]
                        bid = Bid(auction_id=a.id, bidder_alias=alias, amount=amount,
                                  ip_hash=f"sim{secrets.randbelow(3)}")
                        a.current_price = amount
                        db.session.add(bid)
                        db.session.flush()

                        for finding in fraud.scan(a):
                            exists = FraudAlert.query.filter_by(
                                auction_id=a.id, pattern=finding["pattern"]).first()
                            if exists:
                                exists.signals = finding["signals"]
                                exists.severity = finding["severity"]
                            else:
                                code = f"FA-{FraudAlert.query.count() + 101}"
                                db.session.add(FraudAlert(
                                    code=code, auction_id=a.id, pattern=finding["pattern"],
                                    title=finding["title"], severity=finding["severity"],
                                    signals=finding["signals"], note=finding["note"]))
                                audit.record("مزاد+ (محرك النزاهة)", "ai", "تنبيه نمط مزايدة",
                                             f"{code} — {finding['title']} في {a.code}",
                                             entity=f"auction:{a.code}")
                        db.session.commit()
                        bus.publish("bid", {"auction": a.code, "bid": bid.to_dict(),
                                            "currentPrice": a.current_price})
            except Exception as exc:  # keep the runner alive across hiccups
                traceback.print_exc()
                print(f"[auction-runner] {exc}", flush=True)
            time.sleep(7)

    threading.Thread(target=loop, daemon=True, name="auction-runner").start()


app = create_app()


def bootstrap():
    """Seed on first boot (hosted disks start empty) and start the runner."""
    with app.app_context():
        if not os.path.exists(DB_PATH):
            print("قاعدة البيانات غير موجودة — جارٍ البذر…", flush=True)
            from seed import seed
            seed()
        start_auction_runner(app)


if os.environ.get("MAZAD_AUTOBOOT") == "1":
    bootstrap()  # under gunicorn

if __name__ == "__main__":
    bootstrap()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5001)), debug=False, threaded=True)
