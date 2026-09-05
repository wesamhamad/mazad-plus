"""
مزاد+ — نماذج قاعدة البيانات
Mazad+ — database models.

Entity model follows §11 of the Infath Innovation Program study:
Users, Properties, Auctions, Bids, Payments, Deposits, Documents,
FraudAlerts, AuditLogs, Notifications.
"""
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def utcnow():
    return datetime.now(timezone.utc)


def as_utc(dt):
    """Normalise a datetime to timezone-aware UTC.

    Rows freshly created in the session carry an aware `created_at` (it came
    from utcnow()), while rows loaded back from SQLite come out naive — and
    comparing the two raises TypeError. Anything that sorts or subtracts
    datetimes must put them through here first.
    """
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def iso(dt):
    """Serialise a datetime as an unambiguous UTC ISO string.

    SQLite drops the tzinfo, so values come back naive even though they were
    stored as UTC. Emitting them bare makes the browser parse them as local
    time — which silently shifts every countdown and timestamp by the client's
    offset. Every datetime leaving the API goes through here.
    """
    if dt is None:
        return None
    return as_utc(dt).isoformat()


class User(db.Model):
    """Users — بيانات المستخدمين والصلاحيات.

    `national_id` is the Nafath identifier. In this demo build it is matched
    against this local table instead of the real National Single Sign-On,
    which requires an application, an integration agreement and prior
    approval from the National Information Center.
    """

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    national_id = db.Column(db.String(10), unique=True, nullable=False, index=True)
    full_name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(40), nullable=False)  # agent | appraiser | compliance | bidder
    role_label = db.Column(db.String(60), nullable=False)
    organization = db.Column(db.String(120))
    license_no = db.Column(db.String(60))
    phone_masked = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "nationalId": self.national_id,
            "fullName": self.full_name,
            "role": self.role,
            "roleLabel": self.role_label,
            "organization": self.organization,
            "licenseNo": self.license_no,
            "phoneMasked": self.phone_masked,
        }


class AuthRequest(db.Model):
    """Short-lived Nafath-style authentication request (simulated push)."""

    __tablename__ = "auth_requests"

    id = db.Column(db.String(36), primary_key=True)
    national_id = db.Column(db.String(10), nullable=False)
    code = db.Column(db.String(2), nullable=False)  # the 2-digit confirmation number
    decoys = db.Column(db.String(20), nullable=False)  # the other two numbers shown in-app
    status = db.Column(db.String(20), default="pending")  # pending|approved|rejected|expired
    created_at = db.Column(db.DateTime, default=utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)


class Session(db.Model):
    __tablename__ = "sessions"

    token = db.Column(db.String(64), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)
    user = db.relationship("User")


class Property(db.Model):
    """Properties — بيانات العقارات والأصول المعروضة للمزاد."""

    __tablename__ = "properties"

    id = db.Column(db.Integer, primary_key=True)
    ref = db.Column(db.String(20), unique=True, nullable=False, index=True)
    title = db.Column(db.String(160), nullable=False)
    asset_type = db.Column(db.String(40), nullable=False)  # عقار | منقولات
    # Sub-class is what makes a comparable comparable: "عقار in الرياض" spans a
    # studio flat and an industrial warehouse, and a median across those is noise.
    asset_subtype = db.Column(db.String(40), nullable=False, default="أخرى")
    city = db.Column(db.String(60), nullable=False)
    district = db.Column(db.String(80))
    area_sqm = db.Column(db.Float)
    # Coordinates come from district geocoding, not from the deed: a Saudi deed
    # gives boundaries and lengths, not a lat/lng pair. So these are derived and
    # flagged as approximate wherever they are shown.
    lat = db.Column(db.Float)
    lng = db.Column(db.Float)
    # Approximate boundary ring [[lat,lng],...] and how it was derived — see
    # services/geo.py. Never a surveyed polygon.
    parcel = db.Column(db.JSON)
    parcel_source = db.Column(db.String(120))
    condition_note = db.Column(db.Text)
    estimated_value = db.Column(db.Float)  # None = لم يُنشر رقم — never a fake zero
    last_inspection = db.Column(db.Date)
    deed_number = db.Column(db.String(40))
    owner_agent_id = db.Column(db.Integer, db.ForeignKey("users.id"))

    # computed by services.readiness — persisted so the score is auditable
    readiness_score = db.Column(db.Integer, default=0)
    readiness_flags = db.Column(db.JSON, default=list)

    # computed by services.pricing
    price_low = db.Column(db.Float)
    price_high = db.Column(db.Float)
    hammer_probability = db.Column(db.Integer)
    price_comparables = db.Column(db.JSON, default=list)
    price_status = db.Column(db.String(20), default="pending")  # pending|approved|overridden
    price_decided_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    price_decision_reason = db.Column(db.Text)
    price_decided_at = db.Column(db.DateTime)

    documents = db.relationship("Document", back_populates="property", cascade="all, delete-orphan")
    auctions = db.relationship("Auction", back_populates="property")

    def to_dict(self, with_docs=True):
        d = {
            "ref": self.ref,
            "title": self.title,
            "assetType": self.asset_type,
            "assetSubtype": self.asset_subtype,
            "city": self.city,
            "district": self.district,
            "areaSqm": self.area_sqm,
            "lat": self.lat,
            "lng": self.lng,
            "parcel": self.parcel,
            "parcelSource": self.parcel_source,
            "conditionNote": self.condition_note,
            "estimatedValue": self.estimated_value,
            "lastInspection": self.last_inspection.isoformat() if self.last_inspection else None,
            "deedNumber": self.deed_number,
            "readinessScore": self.readiness_score,
            "readinessFlags": self.readiness_flags or [],
            "price": {
                "low": self.price_low,
                "high": self.price_high,
                "hammerProbability": self.hammer_probability,
                "comparables": self.price_comparables or [],
                "status": self.price_status,
                "reason": self.price_decision_reason,
                "decidedAt": iso(self.price_decided_at),
            },
        }
        if with_docs:
            d["documents"] = [doc.to_dict() for doc in self.documents]
            d["photos"] = [ph.to_dict() for ph in self.photos]
        return d


class Document(db.Model):
    """Documents — مستندات العقار وحالتها."""

    __tablename__ = "documents"

    id = db.Column(db.Integer, primary_key=True)
    property_id = db.Column(db.Integer, db.ForeignKey("properties.id"), nullable=False)
    doc_type = db.Column(db.String(80), nullable=False)
    label = db.Column(db.String(120), nullable=False)
    required = db.Column(db.Boolean, default=True)
    present = db.Column(db.Boolean, default=False)
    uploaded_at = db.Column(db.DateTime)

    property = db.relationship("Property", back_populates="documents")

    def to_dict(self):
        return {
            "id": self.id,
            "docType": self.doc_type,
            "label": self.label,
            "required": self.required,
            "present": self.present,
            "uploadedAt": iso(self.uploaded_at),
        }


class Auction(db.Model):
    """Auctions — بيانات المزادات وإعداداتها وحالتها."""

    __tablename__ = "auctions"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(24), unique=True, nullable=False, index=True)
    property_id = db.Column(db.Integer, db.ForeignKey("properties.id"), nullable=False)
    platform = db.Column(db.String(60))  # accredited platform running the auction
    status = db.Column(db.String(20), default="draft")  # draft|blocked|upcoming|live|closed|cancelled
    opening_price = db.Column(db.Float)
    current_price = db.Column(db.Float)
    min_increment = db.Column(db.Float, default=1000)
    deposit_amount = db.Column(db.Float)
    announced_at = db.Column(db.DateTime)
    starts_at = db.Column(db.DateTime)
    ends_at = db.Column(db.DateTime)
    winner_user_id = db.Column(db.Integer, db.ForeignKey("users.id"))

    property = db.relationship("Property", back_populates="auctions")
    bids = db.relationship("Bid", back_populates="auction",
                           cascade="all, delete-orphan",
                           order_by="Bid.created_at.desc()")

    def to_dict(self, with_property=True, with_bids=False):
        d = {
            "code": self.code,
            "platform": self.platform,
            "status": self.status,
            "openingPrice": self.opening_price,
            "currentPrice": self.current_price,
            "minIncrement": self.min_increment,
            "depositAmount": self.deposit_amount,
            "announcedAt": iso(self.announced_at),
            "startsAt": iso(self.starts_at),
            "endsAt": iso(self.ends_at),
            "bidCount": len(self.bids),
            "bidderCount": len({b.bidder_alias for b in self.bids}),
        }
        if with_property:
            d["property"] = self.property.to_dict()
        if with_bids:
            d["bids"] = [b.to_dict() for b in self.bids[:25]]
        return d


class Bid(db.Model):
    """Bids — سجل المزايدات لكل مزاد.

    `bidder_alias` is what the UI ever sees. The real identity stays in
    `bidder_user_id` behind the API, and behavioural analysis runs on the
    alias — data minimisation under the Personal Data Protection Law.
    """

    __tablename__ = "bids"

    id = db.Column(db.Integer, primary_key=True)
    auction_id = db.Column(db.Integer, db.ForeignKey("auctions.id"), nullable=False)
    bidder_user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    bidder_alias = db.Column(db.String(20), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    ip_hash = db.Column(db.String(16))  # pseudonymous — a risk signal, never proof
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    auction = db.relationship("Auction", back_populates="bids")

    def to_dict(self):
        return {
            "id": self.id,
            "alias": self.bidder_alias,
            "amount": self.amount,
            "createdAt": iso(self.created_at),
        }


class Deposit(db.Model):
    """Deposits — العربون المرتبط بكل مستخدم ومزاد.

    Only ever a pre-agreed, disclosed Arbun that may be forfeited on
    withdrawal. There is deliberately no late-payment fee field anywhere in
    this schema — a surcharge on a due money debt in exchange for more time
    is Riba, and both Ibn Baz and Ibn Uthaymin ruled it impermissible.
    """

    __tablename__ = "deposits"

    id = db.Column(db.Integer, primary_key=True)
    auction_id = db.Column(db.Integer, db.ForeignKey("auctions.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    disclosure_accepted_at = db.Column(db.DateTime)  # logged acknowledgement before first bid
    status = db.Column(db.String(20), default="held")  # held|refunded|forfeited
    created_at = db.Column(db.DateTime, default=utcnow)


class Payment(db.Model):
    """Payments — عمليات الدفع والتحصيل."""

    __tablename__ = "payments"

    id = db.Column(db.Integer, primary_key=True)
    auction_id = db.Column(db.Integer, db.ForeignKey("auctions.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    kind = db.Column(db.String(30))  # deposit | settlement
    status = db.Column(db.String(20), default="pending")  # pending|settled|failed
    due_at = db.Column(db.DateTime)
    settled_at = db.Column(db.DateTime)


class FraudAlert(db.Model):
    """FraudAlerts — تنبيهات الأنماط السلوكية المشبوهة.

    Output is always an alert to a human supervisor. The system never
    auto-blocks a bidder: excluding a person from a judicial auction touches
    a financial right and is a high-risk use under SDAIA's AI principles,
    which requires human review.
    """

    __tablename__ = "fraud_alerts"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False)
    auction_id = db.Column(db.Integer, db.ForeignKey("auctions.id"))
    pattern = db.Column(db.String(40))  # shill_pair | late_sniping | coordinated_withdrawal
    title = db.Column(db.String(160), nullable=False)
    severity = db.Column(db.String(20), default="متوسط")
    signals = db.Column(db.JSON, default=list)
    note = db.Column(db.Text)
    state = db.Column(db.String(30), default="مفتوح")
    decided_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    decided_at = db.Column(db.DateTime)

    auction = db.relationship("Auction")

    def to_dict(self):
        return {
            "code": self.code,
            "auctionCode": self.auction.code if self.auction else None,
            "pattern": self.pattern,
            "title": self.title,
            "severity": self.severity,
            "signals": self.signals or [],
            "note": self.note,
            "state": self.state,
            "decidedAt": iso(self.decided_at),
        }


class AuditLog(db.Model):
    """AuditLogs — سجل تدقيق العمليات المهمة.

    Append-only and hash-chained: each row carries the hash of the previous
    row, so any retroactive edit breaks the chain. Personal data stays out of
    the chained payload so the right to erasure remains technically possible.
    """

    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    actor = db.Column(db.String(120), nullable=False)
    actor_kind = db.Column(db.String(20), nullable=False)  # ai | human | config | system
    action = db.Column(db.String(120), nullable=False)
    detail = db.Column(db.Text)
    entity = db.Column(db.String(60))
    prev_hash = db.Column(db.String(64))
    entry_hash = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "actor": self.actor,
            "actorKind": self.actor_kind,
            "action": self.action,
            "detail": self.detail,
            "entity": self.entity,
            "entryHash": (self.entry_hash or "")[:12],
            "createdAt": iso(self.created_at),
        }


class Notification(db.Model):
    """Notifications — إشعارات المستخدمين."""

    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    title = db.Column(db.String(160), nullable=False)
    body = db.Column(db.Text)
    tone = db.Column(db.String(20), default="info")
    read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "body": self.body,
            "tone": self.tone,
            "read": self.read,
            "createdAt": iso(self.created_at),
        }


class Setting(db.Model):
    """Regulatory parameters — معاملات نظامية قابلة للضبط.

    Notice periods, deposit caps and payment deadlines live here, never in
    code: the new Enforcement Law (Royal Decree M/237) comes into force
    around 28 October 2026 and its executive regulation has not been issued,
    so these values are expected to move.
    """

    __tablename__ = "settings"

    key = db.Column(db.String(40), primary_key=True)
    title = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text)
    value = db.Column(db.Float, nullable=False)
    unit = db.Column(db.String(20))
    basis = db.Column(db.String(200))

    def to_dict(self):
        return {
            "key": self.key,
            "title": self.title,
            "description": self.description,
            "value": self.value,
            "unit": self.unit,
            "basis": self.basis,
        }


class Encumbrance(db.Model):
    """التزامات الأصل — mortgages, leases, disputes, seizures.

    This is the table the pre-bid disclosure ("كشف الأصل") is built on, and it
    is deliberately separate from Documents: a missing document is the agent's
    problem, an active ten-year lease is the *buyer's* problem, and conflating
    them is what makes a bidder default after the award.

    Every row records which official register it came from and when it was
    pulled, because a disclosure field without a dated source is not evidence.
    """

    __tablename__ = "encumbrances"

    id = db.Column(db.Integer, primary_key=True)
    property_id = db.Column(db.Integer, db.ForeignKey("properties.id"), nullable=False)
    kind = db.Column(db.String(30), nullable=False)  # mortgage|lease|dispute|seizure|valuation
    status = db.Column(db.String(20), default="active")  # active|released|expired
    detail = db.Column(db.Text)

    # lease specifics — the single highest-value field in the whole service
    lease_end = db.Column(db.Date)

    # mortgage specifics — a charge held by someone other than the executing
    # creditor does not clear on the award, so the buyer inherits it
    held_by_executing_creditor = db.Column(db.Boolean)
    amount = db.Column(db.Float)

    # valuation specifics
    valuation_date = db.Column(db.Date)
    valuer_licence = db.Column(db.String(60))

    source_key = db.Column(db.String(40))   # najiz|ejar|enforcement|qeema
    fetched_at = db.Column(db.DateTime, default=utcnow)

    property = db.relationship("Property", backref="encumbrances")

    def to_dict(self):
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status,
            "detail": self.detail,
            "leaseEnd": self.lease_end.isoformat() if self.lease_end else None,
            "heldByExecutingCreditor": self.held_by_executing_creditor,
            "amount": self.amount,
            "valuationDate": self.valuation_date.isoformat() if self.valuation_date else None,
            "valuerLicence": self.valuer_licence,
            "sourceKey": self.source_key,
            "fetchedAt": iso(self.fetched_at),
        }


class District(db.Model):
    """الأحياء — geocoded districts with published price-per-m².

    This is the comparables base for the map. `confidence` separates a figure
    taken from a published source from one we inferred, and the UI never shows
    the two the same way.
    """

    __tablename__ = "districts"

    id = db.Column(db.Integer, primary_key=True)
    region = db.Column(db.String(60), nullable=False)
    city = db.Column(db.String(60), nullable=False, index=True)
    name = db.Column(db.String(80), nullable=False)
    lat = db.Column(db.Float)
    lng = db.Column(db.Float)
    land_sar_sqm = db.Column(db.Float)
    built_sar_sqm = db.Column(db.Float)
    tier = db.Column(db.String(20))          # راقٍ | متوسط | اقتصادي
    confidence = db.Column(db.String(20))    # measured | estimated
    source = db.Column(db.String(300))

    def to_dict(self):
        return {
            "id": self.id,
            "region": self.region,
            "city": self.city,
            "name": self.name,
            "lat": self.lat,
            "lng": self.lng,
            "landSarSqm": self.land_sar_sqm,
            "builtSarSqm": self.built_sar_sqm,
            "tier": self.tier,
            "confidence": self.confidence,
            "source": self.source,
        }


class MarketIndicator(db.Model):
    """مؤشرات السوق المنشورة — city/region level published figures."""

    __tablename__ = "market_indicators"

    id = db.Column(db.Integer, primary_key=True)
    scope = db.Column(db.String(60), nullable=False)   # الرياض | القصيم | عسير
    key = db.Column(db.String(60), nullable=False)
    label = db.Column(db.String(160), nullable=False)
    value = db.Column(db.String(120))
    period = db.Column(db.String(80))
    confidence = db.Column(db.String(20))
    source = db.Column(db.String(300))

    def to_dict(self):
        return {
            "scope": self.scope, "key": self.key, "label": self.label,
            "value": self.value, "period": self.period,
            "confidence": self.confidence, "source": self.source,
        }


class Report(db.Model):
    """كشف الأصل وتقرير الإقفال — frozen, hash-sealed snapshots.

    A report is immutable by construction: the payload is frozen at issue time
    and `content_hash` is the SHA-256 of its canonical JSON. Re-deriving the
    hash from the payload is what proves the document was not edited after
    issue — which is what turns a PDF into a document.
    """

    __tablename__ = "reports"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(24), unique=True, nullable=False, index=True)
    kind = db.Column(db.String(20), nullable=False)  # disclosure | closing
    property_ref = db.Column(db.String(20), nullable=False)
    auction_code = db.Column(db.String(24))
    payload = db.Column(db.JSON, nullable=False)
    content_hash = db.Column(db.String(64), nullable=False)
    sealed_at = db.Column(db.DateTime, default=utcnow)
    issued_to = db.Column(db.Integer, db.ForeignKey("users.id"))
    price_sar = db.Column(db.Float, default=0)
    invoice_no = db.Column(db.String(40))

    def to_dict(self, with_payload=False):
        d = {
            "code": self.code,
            "kind": self.kind,
            "propertyRef": self.property_ref,
            "auctionCode": self.auction_code,
            "contentHash": self.content_hash,
            "sealedAt": iso(self.sealed_at),
            "priceSar": self.price_sar,
            "invoiceNo": self.invoice_no,
        }
        if with_payload:
            d["payload"] = self.payload
        return d


class PropertyPhoto(db.Model):
    """صور الأصل — inspection and aerial imagery attached to a property.

    `kind` says what the image actually is: "aerial" is real satellite imagery
    exported around the recorded coordinates; "inspection" is a photograph
    uploaded by the sale agent as part of the inspection file. The UI labels
    the two differently on purpose — an aerial capture of a district centroid
    must never be presented as a photograph of the asset.
    """

    __tablename__ = "property_photos"

    id = db.Column(db.Integer, primary_key=True)
    property_id = db.Column(db.Integer, db.ForeignKey("properties.id"), nullable=False)
    kind = db.Column(db.String(20), nullable=False, default="inspection")  # aerial|inspection
    url = db.Column(db.String(600), nullable=False)
    caption = db.Column(db.String(200))
    sort = db.Column(db.Integer, default=0)
    uploaded_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utcnow)

    property = db.relationship("Property", backref=db.backref("photos", order_by="PropertyPhoto.sort"))

    def to_dict(self):
        return {"id": self.id, "kind": self.kind, "url": self.url, "caption": self.caption,
                "sort": self.sort, "createdAt": iso(self.created_at)}


class CityProfile(db.Model):
    """ملف المدينة — what a buyer chooses a place BY, beyond price.

    Climate, elevation and character are the questions a buyer of a rest house
    or a farm actually asks first ("مناطق باردة"). Values are published facts
    (elevation, climate class) and each row keeps its source.
    """

    __tablename__ = "city_profiles"

    id = db.Column(db.Integer, primary_key=True)
    city = db.Column(db.String(60), unique=True, nullable=False)
    region = db.Column(db.String(60))
    climate = db.Column(db.String(20))        # بارد | معتدل | حار
    elevation_m = db.Column(db.Integer)
    summer_high_c = db.Column(db.Integer)
    winter_low_c = db.Column(db.Integer)
    character = db.Column(db.JSON, default=list)   # سياحي | زراعي | تجاري | صناعي | ...
    note = db.Column(db.String(300))
    source = db.Column(db.String(200))

    def to_dict(self):
        return {"city": self.city, "region": self.region, "climate": self.climate,
                "elevationM": self.elevation_m, "summerHighC": self.summer_high_c,
                "winterLowC": self.winter_low_c, "character": self.character or [],
                "note": self.note, "source": self.source}
