"""محرك توصية سعر الافتتاح — opening-price recommendation.

Design constraints carried straight from the compliance chapter of the study:

  * The output is a *recommendation*, never an approved price. It reaches
    "approved" only after a named appraiser acts on it (see the API route).
  * Explanation is mandatory. Every recommendation ships the comparables and
    the adjustment factors it was built from — a price a committee cannot
    interrogate is not usable in a judicial context.
  * Rule-and-comparables based, not a black box. Until Infath releases the
    closed-auction dataset requested in §15 of the study, a learned model
    would be fitting noise; this engine is the honest interim and its shape
    is the one a learned model would slot into.
"""
from statistics import median

# Comparable closed auctions, per asset type and city. In production this is
# a query against the Infath closed-auction dataset; here it is a seeded
# corpus so the engine's arithmetic is real even though the corpus is demo.
COMPARABLE_CORPUS = {
    ("عقار", "مكة المكرمة"): [
        ("فيلا مماثلة — حي الشوقية", 1_950_000, 420),
        ("فيلا مماثلة — حي العتيبية", 1_880_000, 405),
        ("متوسط 3 مزادات فلل بالمنطقة", 1_920_000, 415),
    ],
    ("عقار", "الرياض"): [
        ("شقة مماثلة — حي النرجس", 690_000, 170),
        ("شقة مماثلة — حي الملقا", 705_000, 175),
        ("متوسط 6 مزادات سكنية (90 يوماً)", 678_000, 168),
        ("عمارة مماثلة — حي الفيصلية", 4_300_000, 870),
    ],
    ("عقار", "جدة"): [
        ("أرض تجارية — طريق الأمير سلطان", 1_290_000, 1_200),
        ("أرض تجارية — حي الروضة", 1_380_000, 1_310),
    ],
    ("منقولات", "الدمام"): [
        ("دفعة مركبات مماثلة — الدمام", 1_145_000, None),
        ("متوسط 4 مزادات منقولات", 1_190_000, None),
    ],
}

# How far below the appraised value an opening price is set. Opening low
# enough to attract depth, high enough not to give the asset away.
OPENING_DISCOUNT = 0.025
RANGE_SPREAD = 0.06


# A comparable is only comparable within a plausible band of the subject's
# value. Without this, a villa in Riyadh gets "compared" to an apartment in
# Riyadh and the median drags the anchor into nonsense.
COMPARABLE_BAND = (0.4, 2.5)


def _comparables_from_closed_auctions(prop):
    """The real source of truth: what similar assets actually hammered at.

    Every auction this platform closes becomes evidence for the next valuation,
    so the engine gets better with use instead of staying frozen at whatever
    corpus it shipped with. Static rows are only the cold-start fallback.
    """
    # Imported here to keep this module importable without an app context.
    from models import Auction, Property

    if not prop.estimated_value:
        return []
    lo = prop.estimated_value * COMPARABLE_BAND[0]
    hi = prop.estimated_value * COMPARABLE_BAND[1]

    rows = (
        Auction.query.join(Property, Auction.property_id == Property.id)
        .filter(
            Auction.status == "closed",
            Auction.current_price.isnot(None),
            Auction.current_price >= lo,
            Auction.current_price <= hi,
            Property.asset_type == prop.asset_type,
            Property.asset_subtype == prop.asset_subtype,
            Property.city == prop.city,
            Property.id != prop.id,
        )
        .order_by(Auction.ends_at.desc())
        .limit(6)
        .all()
    )

    out = []
    for a in rows:
        entry = {
            "label": f"{a.property.title} — رسا في {a.code}",
            "price": a.current_price,
            "source": "closed_auction",
        }
        if a.property.area_sqm and prop.area_sqm:
            entry["basis"] = f"{a.current_price / a.property.area_sqm:,.0f} ر.س/م²"
        out.append(entry)
    return out


def _comparables_for(prop):
    live = _comparables_from_closed_auctions(prop)
    if len(live) >= 2:
        return live

    # Cold start — fall back to the described static corpus, clearly labelled.
    rows = COMPARABLE_CORPUS.get((prop.asset_type, prop.city), [])
    if not prop.estimated_value:
        return list(live)
    lo = prop.estimated_value * COMPARABLE_BAND[0]
    hi = prop.estimated_value * COMPARABLE_BAND[1]
    out = list(live)
    seen = {e["label"] for e in out}
    for label, price, area in rows:
        if not (lo <= price <= hi) or label in seen:
            continue  # different asset class in the same city — not a comparable
        entry = {"label": label, "price": price, "source": "reference"}
        if area and prop.area_sqm:
            entry["pricePerSqm"] = round(price / area)
            entry["basis"] = f"{price / area:,.0f} ر.س/م²"
        out.append(entry)
    return out


def missing_required_documents(prop):
    return [d.label for d in prop.documents if d.required and not d.present]


def unavailable_reason(prop):
    """Why pricing is refused — or None when it can proceed.

    "We are missing your title deed" and "we have never sold anything like this
    here" are different problems with different fixes, and telling an agent the
    first when the truth is the second sends them chasing a document that is
    already on file.
    """
    if not prop.estimated_value:
        return {"code": "no_valuation",
                "message": "لا توجد قيمة تقديرية معتمدة لهذا الأصل"}
    missing = missing_required_documents(prop)
    if missing:
        return {"code": "missing_documents",
                "message": "التسعير متوقّف حتى تكتمل المستندات الإلزامية: " + "، ".join(missing),
                "items": missing}
    if not _comparables_for(prop):
        return {"code": "no_comparables",
                "message": f"لا توجد مزادات منتهية مماثلة لـ«{prop.asset_subtype}» في {prop.city} "
                           "لبناء مقارنة عليها. المستندات مكتملة — الناقص هو سوابق البيع، "
                           "وهي تُبنى مع كل ترسية جديدة في المنصة."}
    return None


def recommend(prop):
    """Return a recommendation dict, or None when the asset cannot be priced.

    Refusing to price an incomplete asset is the point, not a limitation:
    a price built on a missing title deed is a liability, not a feature.
    """
    if unavailable_reason(prop):
        return None
    comparables = _comparables_for(prop)

    # Anchor on the appraised value, sanity-checked against the comparables.
    anchor = prop.estimated_value
    comp_median = median(c["price"] for c in comparables)

    # If the comparables disagree with the appraisal by more than 15%, pull
    # the anchor a third of the way toward them and say so out loud.
    factors = [
        {"label": "القيمة التقديرية المعتمدة", "effect": f"{anchor:,.0f} ر.س"},
        {"label": "وسيط المقارنات", "effect": f"{comp_median:,.0f} ر.س"},
    ]
    # A single comparable is not a median. Adjusting the appraised value on the
    # strength of one observation is how a pricing engine talks itself above
    # the appraisal, so the adjustment needs at least two to fire.
    divergence = abs(comp_median - anchor) / anchor
    if divergence > 0.15 and len(comparables) >= 2:
        anchor = anchor + (comp_median - anchor) / 3
        factors.append({
            "label": "تعديل لانحراف المقارنات",
            "effect": f"انحراف {divergence:.0%} — سُحب المرساة ثلث المسافة نحو الوسيط",
        })

    elif divergence > 0.15:
        factors.append({
            "label": "مقارنة وحيدة — لم يُطبَّق تعديل",
            "effect": f"انحراف {divergence:.0%} عن مقارنة واحدة لا يكفي لتعديل المرساة",
        })

    low = round(anchor * (1 - OPENING_DISCOUNT), -3)
    high = round(low * (1 + RANGE_SPREAD), -3)
    factors.append({
        "label": "خصم سعر الافتتاح",
        "effect": f"−{OPENING_DISCOUNT:.1%} عن المرساة لتعميق الطلب",
    })

    # Hammer probability: readiness and comparable depth are what actually
    # move first-round success, so those are what the estimate is built on.
    depth_term = min(len(comparables) / 4, 1.0) * 30
    readiness_term = (prop.readiness_score or 0) / 100 * 55
    recency_term = 15 if prop.last_inspection else 0
    probability = int(round(min(95, depth_term + readiness_term + recency_term)))
    factors.append({
        "label": "احتمالية الترسية",
        "effect": f"جاهزية {prop.readiness_score}/100 · {len(comparables)} مقارنات · معاينة "
                  + ("حديثة" if prop.last_inspection else "غير مسجّلة"),
    })

    return {
        "low": low,
        "high": high,
        "hammerProbability": probability,
        "comparables": comparables,
        "factors": factors,
    }


def apply(prop):
    """Compute and persist a recommendation onto the property."""
    rec = recommend(prop)
    if not rec:
        prop.price_low = prop.price_high = prop.hammer_probability = None
        prop.price_comparables = []
        prop.price_status = "unavailable"
        return None
    prop.price_low = rec["low"]
    prop.price_high = rec["high"]
    prop.hammer_probability = rec["hammerProbability"]
    prop.price_comparables = rec["comparables"] + [
        {"label": f["label"], "price": None, "basis": f["effect"]} for f in rec["factors"]
    ]
    if prop.price_status not in ("approved", "overridden"):
        prop.price_status = "pending"
    return rec
