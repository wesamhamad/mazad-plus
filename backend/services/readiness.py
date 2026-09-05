"""محرك درجة الجاهزية للطرح — listing-readiness scoring.

The score is deliberately rule-based and fully explainable: every point
deducted names the field that caused it. A model that cannot say why an
asset was blocked cannot be used to block a judicial listing.

Weights sum to 100 and are expressed here as data, so they can be tuned
without touching the traversal logic.
"""
from datetime import date

WEIGHTS = {
    "required_documents": 45,   # كل مستند إلزامي مرفوع
    "inspection_recency": 20,   # معاينة خلال نافذة زمنية
    "core_fields": 20,          # حقول بطاقة الأصل الأساسية
    "valuation_present": 15,    # وجود قيمة تقديرية
}

INSPECTION_MAX_AGE_DAYS = 90


def evaluate(prop, today=None):
    """Return (score, flags) for a Property.

    `flags` is a list of {field, message, weight} — the blocking reasons the
    UI shows verbatim, so the agent knows exactly what to fix.
    """
    today = today or date.today()
    score = 0
    flags = []

    # 1. Required documents ------------------------------------------------
    required = [d for d in prop.documents if d.required]
    if required:
        present = [d for d in required if d.present]
        ratio = len(present) / len(required)
        score += round(WEIGHTS["required_documents"] * ratio)
        for d in required:
            if not d.present:
                flags.append({
                    "field": d.doc_type,
                    "message": f"{d.label} غير مرفوع",
                    "weight": round(WEIGHTS["required_documents"] / len(required)),
                })
    else:
        flags.append({
            "field": "documents",
            "message": "لم تُعرَّف قائمة المستندات الإلزامية لهذا النوع من الأصول",
            "weight": WEIGHTS["required_documents"],
        })

    # 2. Inspection recency -------------------------------------------------
    if prop.last_inspection:
        age = (today - prop.last_inspection).days
        if age <= INSPECTION_MAX_AGE_DAYS:
            score += WEIGHTS["inspection_recency"]
        else:
            # partial credit that decays instead of a cliff edge
            decay = max(0.0, 1 - (age - INSPECTION_MAX_AGE_DAYS) / 180)
            score += round(WEIGHTS["inspection_recency"] * decay)
            flags.append({
                "field": "last_inspection",
                "message": f"آخر معاينة قبل {age} يوماً — تتجاوز نافذة {INSPECTION_MAX_AGE_DAYS} يوماً",
                "weight": WEIGHTS["inspection_recency"],
            })
    else:
        flags.append({
            "field": "last_inspection",
            "message": "لا يوجد تاريخ معاينة مسجّل",
            "weight": WEIGHTS["inspection_recency"],
        })

    # 3. Core asset-card fields --------------------------------------------
    core = {
        "title": (prop.title, "وصف الأصل"),
        "city": (prop.city, "المدينة"),
        "asset_type": (prop.asset_type, "نوع الأصل"),
        "condition_note": (prop.condition_note, "الحالة الفنية"),
    }
    filled = [k for k, (v, _) in core.items() if v]
    score += round(WEIGHTS["core_fields"] * len(filled) / len(core))
    for k, (v, label) in core.items():
        if not v:
            flags.append({
                "field": k,
                "message": f"حقل «{label}» فارغ في بطاقة الأصل",
                "weight": round(WEIGHTS["core_fields"] / len(core)),
            })

    # 4. Valuation ----------------------------------------------------------
    if prop.estimated_value and prop.estimated_value > 0:
        score += WEIGHTS["valuation_present"]
    else:
        flags.append({
            "field": "estimated_value",
            "message": "لا توجد قيمة تقديرية معتمدة",
            "weight": WEIGHTS["valuation_present"],
        })

    return min(100, score), flags


def recompute(prop, today=None):
    """Persist the score onto the property and return it."""
    score, flags = evaluate(prop, today)
    prop.readiness_score = score
    prop.readiness_flags = flags
    return score, flags
