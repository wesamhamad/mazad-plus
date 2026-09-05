"""كشف الأصل وتقرير الإقفال — disclosure and closing reports.

هذه الخدمة الثالثة، وهي المحور المالي للمنتج: منتج معلوماتي يُباع بالنسخة،
لا نسبة من قيمة الصفقة. التكييف مقصود — الاشتراك والرسم الثابت لا يستحضران
ركن العمولة في تعريف الوساطة العقارية، والنسبة تستحضره مباشرة.

آلية الختم
----------
The payload is serialised canonically (sorted keys, no whitespace drift) and
hashed with SHA-256. `verify()` re-derives the hash from the stored payload, so
any edit after issue is detectable. That is a sealed document — and it is a
deliberately smaller claim than a blockchain: an append-only, cryptographically
signed record gives the same tamper-evidence at a fraction of the complexity,
and keeps personal data erasable under PDPL, which an immutable ledger cannot.

قاعدة الخصوصية
--------------
تقرير الإقفال يحمل حالة الأصل ووقائع المزاد — لا هوية المالك ولا المدين ولا
المزايدين. المزايدون يظهرون بأسماء مستعارة فقط، وهي القاعدة نفسها المطبّقة في
كل واجهات المنصة.
"""
import hashlib
import json

from models import Report, db, iso, utcnow
from services import flags as flags_engine
from services import registry

# رسوم ثابتة لكل نسخة — منتج معلوماتي، لا نسبة من الصفقة
PRICE_DISCLOSURE = 49.0
PRICE_CLOSING = 249.0
VAT_RATE = 0.15


def canonical(payload):
    """Deterministic serialisation — the thing that actually gets hashed."""
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(payload):
    return hashlib.sha256(canonical(payload).encode("utf-8")).hexdigest()


def _next_code(kind):
    prefix = "DSC" if kind == "disclosure" else "CLS"
    n = Report.query.filter_by(kind=kind).count() + 1001
    return f"{prefix}-{n}"


def _invoice_no(kind):
    """ZATCA-shaped sequential invoice number.

    Shape only. A real deployment needs Phase-2 e-invoicing: a cryptographic
    stamp, a UUID, a QR carrying seller VAT number and totals, and clearance
    against the ZATCA portal. None of that can be simulated honestly, so the
    number is generated and the rest is declared as outstanding.
    """
    n = Report.query.count() + 1
    return f"MZP-2026-{n:06d}"


def build_disclosure(prop, auction=None):
    """كشف الأصل — the pre-bid payload. Pure; does not persist."""
    results = registry.query_all(prop)
    found = flags_engine.evaluate(prop, results)

    return {
        "kind": "disclosure",
        "generatedAt": utcnow().isoformat(),
        "asset": {
            "ref": prop.ref,
            "title": prop.title,
            "type": prop.asset_type,
            "subtype": prop.asset_subtype,
            "city": prop.city,
            "district": prop.district,
            "areaSqm": prop.area_sqm,
            "deedNumber": prop.deed_number,
            "estimatedValue": prop.estimated_value,
            "conditionNote": prop.condition_note,
            "lastInspection": prop.last_inspection.isoformat() if prop.last_inspection else None,
        },
        "auction": {
            "code": auction.code,
            "status": auction.status,
            "openingPrice": auction.opening_price,
            "depositAmount": auction.deposit_amount,
            "endsAt": iso(auction.ends_at),
        } if auction else None,
        # every register response, with its mode and timestamp intact
        "registers": results,
        "flags": found,
        "summary": flags_engine.summarize(found),
        "privacyNote": (
            "يعرض هذا الكشف حالة الأصل فقط. هوية المالك أو المدين أو المرتهن "
            "بيانات شخصية ولا تُعرض بحال."
        ),
    }


def build_closing(prop, auction):
    """تقرير الإقفال — the post-award payload. Pure; does not persist."""
    disclosure = build_disclosure(prop, auction)
    bids = sorted(auction.bids, key=lambda b: b.amount)

    curve = [{"at": iso(b.created_at), "amount": b.amount, "alias": b.bidder_alias}
             for b in sorted(auction.bids, key=lambda b: b.created_at)]

    hammer = auction.current_price or 0
    estimate = prop.estimated_value or 0
    return {
        **disclosure,
        "kind": "closing",
        # ج) أساس التقييم
        "valuationBasis": (disclosure["registers"].get("qeema", {}).get("data") or {}).get("report"),
        # د) وقائع المزاد
        "auctionFacts": {
            "code": auction.code,
            "platform": auction.platform,
            "openingPrice": auction.opening_price,
            "hammerPrice": hammer,
            "bidderCount": len({b.bidder_alias for b in auction.bids}),
            "bidCount": len(auction.bids),
            "minIncrement": auction.min_increment,
            "announcedAt": iso(auction.announced_at),
            "endsAt": iso(auction.ends_at),
            "priceCurve": curve,
            "topBid": bids[-1].amount if bids else None,
        },
        # هـ) الانحراف
        "deviation": {
            "hammerVsEstimate": round((hammer - estimate) / estimate * 100, 1) if estimate else None,
            "hammerVsOpening": round(
                (hammer - auction.opening_price) / auction.opening_price * 100, 1
            ) if auction.opening_price else None,
        },
        # و) ما بعد الترسية
        "postAward": {
            "obligationsTransferred": [
                f["title"] for f in disclosure["flags"] if f["level"] == "red"
            ],
            "depositAmount": auction.deposit_amount,
            "note": (
                "الالتزامات أعلاه تنتقل مع الأصل ولا يُسقطها قرار الترسية بالضرورة. "
                "لا تُفرض أي رسوم تأخير على الثمن — أثر النكول ينحصر في مصادرة العربون "
                "المتفق عليه مسبقاً، أو إلغاء الترسية، أو الحظر."
            ),
        },
    }


def issue(prop, auction, kind, user):
    """Freeze, hash, persist. This is the moment the report becomes a document."""
    payload = (build_closing(prop, auction) if kind == "closing"
               else build_disclosure(prop, auction))

    # The hash must not cover its own container, so seal the payload as built.
    content_hash = digest(payload)
    price = PRICE_CLOSING if kind == "closing" else PRICE_DISCLOSURE

    report = Report(
        code=_next_code(kind),
        kind=kind,
        property_ref=prop.ref,
        auction_code=auction.code if auction else None,
        payload=payload,
        content_hash=content_hash,
        issued_to=user.id if user else None,
        price_sar=price,
        invoice_no=_invoice_no(kind),
    )
    db.session.add(report)
    return report


def verify(report):
    """Re-derive the hash and compare. This is the whole integrity claim."""
    expected = digest(report.payload)
    return {
        "valid": expected == report.content_hash,
        "expected": expected,
        "stored": report.content_hash,
    }


def invoice_for(report):
    """The ZATCA-shaped invoice lines for one report."""
    net = report.price_sar or 0
    vat = round(net * VAT_RATE, 2)
    return {
        "invoiceNo": report.invoice_no,
        "issuedAt": iso(report.sealed_at),
        "seller": {"name": "مزاد+", "vatNumber": "—", "note": "رقم ضريبي غير مُصدر في النموذج التجريبي"},
        "lines": [{
            "description": ("تقرير إقفال مزاد" if report.kind == "closing" else "كشف أصل قبل المزايدة"),
            "reference": report.code,
            "net": net,
        }],
        "net": net,
        "vatRate": VAT_RATE,
        "vat": vat,
        "total": round(net + vat, 2),
        "compliance": (
            "هذه فاتورة بالشكل فقط. الفوترة الإلكترونية (فاتورة) في المرحلة الثانية تتطلب "
            "ختماً تشفيرياً ومعرّفاً فريداً ورمز QR وربطاً للمطابقة مع هيئة الزكاة والضريبة "
            "والجمارك — ولا يمكن محاكاة أيٍّ من ذلك بصدق."
        ),
    }
