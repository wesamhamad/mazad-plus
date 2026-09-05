"""القيمة المضافة — added-value matrix vs the accredited auction platforms.

Infath does not run one auction platform; it accredits several and relies on
licensed sale agents. So the honest question a committee will ask is not "is
this a good platform?" but "what does this do that the six accredited ones
already do not?" This module is that answer, kept as data so it can be argued
with line by line.

Two disciplines are enforced here:

  1. **Capability kind is labelled, not blurred.** A rule engine is not a model,
     and a governance decision is not either. Presenting "compliance by design"
     as AI would be the exact overclaim a technical evaluator is looking for.
  2. **Competitor cells are evidence-graded.** "partial" means the capability is
     not publicly documented either way — not that it is absent. Marking a
     competitor "absent" without evidence is a claim this project cannot support.
"""

# kind: ai | rules | infra | model  — what the capability actually IS
# level: full | partial | none      — availability, evidence-graded
PLATFORMS = [
    {"key": "mazad", "name": "مزاد+", "self": True},
    {"key": "aldal", "name": "الدال"},
    {"key": "sumtek", "name": "سومتك"},
    {"key": "wasalt", "name": "وصلت مزادات"},
    {"key": "saudi", "name": "السعودية للمزادات"},
    {"key": "dar", "name": "دار المزادات"},
    {"key": "mubasher", "name": "مباشر"},
]

KINDS = {
    "ai": {"label": "نموذج ذكاء اصطناعي فعلي", "short": "AI"},
    "rules": {"label": "منطق قواعد قابل للتدقيق", "short": "قواعد"},
    "infra": {"label": "بنية / حوكمة — بلا تعلّم آلي", "short": "بنية"},
    "model": {"label": "نموذج تشغيلي / معماري", "short": "نموذج"},
}

LEVELS = {
    "full": {"label": "متوفرة بالكامل", "tone": "success"},
    "partial": {"label": "جزئية أو غير مؤكدة علنياً", "tone": "warning"},
    "none": {"label": "غير متوفرة", "tone": "muted"},
}

FEATURES = [
    {
        "key": "pre_bid_disclosure",
        "title": "كشف الأصل قبل المزايدة",
        "detail": "استعلام موحّد برقم الصك عن الرهن والإيجار والنزاع — يقرّر المزايد قبل دفع العربون",
        "kind": "rules",
        "route": "properties",
        "cells": {"mazad": "full", "aldal": "none", "sumtek": "none", "wasalt": "none",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
    {
        "key": "eviction_risk",
        "title": "كشف الإيجار الوقائي ومخاطر الإخلاء",
        "detail": "عقد إيجار مسجّل يتجاوز 24 شهراً = علم أحمر — أكثر مفاجآت المزادات كلفةً على المشتري",
        "kind": "rules",
        "route": "properties",
        "cells": {"mazad": "full", "aldal": "none", "sumtek": "none", "wasalt": "none",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
    {
        "key": "comparison_map",
        "title": "خريطة مقارنة عبر المدن",
        "detail": "وسائط صفقات الأحياء المنشورة مقابل سعر المزاد — بحث بالمواصفة لا بالموقع",
        "kind": "infra",
        "route": "map",
        "cells": {"mazad": "full", "aldal": "partial", "sumtek": "none", "wasalt": "partial",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
    {
        "key": "closing_report",
        "title": "تقرير إقفال مختوم زمنياً",
        "detail": "بطاقة الأصل + سجل المزايدات + منهجية التقييم، مجمّدة ومختومة ببصمة تجزئة",
        "kind": "infra",
        "route": "reports",
        "cells": {"mazad": "full", "aldal": "none", "sumtek": "none", "wasalt": "none",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
    {
        "key": "information_revenue",
        "title": "إيراد معلوماتي لا نسبة من الصفقة",
        "detail": "رسم ثابت لكل تقرير — لا يستحضر ركن العمولة في تعريف الوساطة العقارية",
        "kind": "model",
        "route": "reports",
        "cells": {"mazad": "full", "aldal": "none", "sumtek": "none", "wasalt": "none",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
    {
        "key": "asset_card",
        "title": "بطاقة أصل موحّدة",
        "detail": "تُستخرج آلياً من مستندات المعاينة — نموذج لغوي-بصري للقراءة",
        "kind": "ai",
        "route": "properties",
        "cells": {"mazad": "full", "aldal": "none", "sumtek": "none", "wasalt": "none",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
    {
        "key": "readiness",
        "title": "درجة جاهزية للطرح",
        "detail": "تمنع إدراج الأصول الناقصة — منطق صريح قابل للتدقيق، عمداً بلا تعلّم آلي",
        "kind": "rules",
        "route": "properties",
        "cells": {"mazad": "full", "aldal": "none", "sumtek": "none", "wasalt": "none",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
    {
        "key": "opening_price",
        "title": "توصية سعر الافتتاح",
        "detail": "مبنية على المزادات المنتهية داخل المنصة — كل ترسية تُغذّي التوصية التالية",
        "kind": "ai",
        "route": "properties",
        "cells": {"mazad": "full", "aldal": "none", "sumtek": "none", "wasalt": "none",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
    {
        "key": "hammer_probability",
        "title": "احتمالية الترسية",
        "detail": "تقدير مسبق قبل الطرح — مخرج احتمالي لا رقم قاطع",
        "kind": "ai",
        "route": "properties",
        "cells": {"mazad": "full", "aldal": "none", "sumtek": "none", "wasalt": "none",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
    {
        "key": "explainability",
        "title": "تفسير آلي للتسعير",
        "detail": "العوامل والمقارنات وراء كل توصية — طبقة تفسير فوق نموذج التسعير",
        "kind": "ai",
        "route": "properties",
        "cells": {"mazad": "full", "aldal": "none", "sumtek": "none", "wasalt": "none",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
    {
        "key": "shill_detection",
        "title": "كشف المزايدة الوهمية",
        "detail": "تواطؤ، قنص، أنماط شاذة — إنفاذ آلي للنهي عن النجش",
        "kind": "ai",
        "route": "fraud",
        "cells": {"mazad": "full", "aldal": "none", "sumtek": "none", "wasalt": "none",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
    {
        "key": "audit_log",
        "title": "سجل تدقيق غير قابل للتعديل",
        "detail": "كل قرار وتعديل بتري مسجّل ومترابط بالتجزئة — تسجيل أحداث، لا تعلّم آلي",
        "kind": "infra",
        "route": "audit",
        "cells": {"mazad": "full", "aldal": "partial", "sumtek": "partial", "wasalt": "partial",
                  "saudi": "partial", "dar": "partial", "mubasher": "partial"},
    },
    {
        "key": "nafath",
        "title": "هوية موثّقة بالنفاذ الوطني",
        "detail": "تسجيل دخول موحّد للمستفيد — تكامل حكومي جاهز، لا نموذج",
        "kind": "infra",
        "route": None,
        "cells": {"mazad": "full", "aldal": "partial", "sumtek": "full", "wasalt": "full",
                  "saudi": "partial", "dar": "partial", "mubasher": "partial"},
    },
    {
        "key": "live_auction",
        "title": "تشغيل المزاد الحي",
        "detail": "تسجيل المزايدين وإدارة المزايدة والترسية",
        "kind": "infra",
        "route": "auctions",
        "cells": {"mazad": "full", "aldal": "full", "sumtek": "full", "wasalt": "full",
                  "saudi": "full", "dar": "full", "mubasher": "full"},
    },
    {
        "key": "cross_platform",
        "title": "خدمة موحّدة عبر المنصات الست",
        "detail": "لا حبيسة منصة واحدة — قرار معماري وتجاري، لا خوارزمية",
        "kind": "model",
        "route": None,
        "cells": {"mazad": "full", "aldal": "none", "sumtek": "none", "wasalt": "none",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
    {
        "key": "params",
        "title": "معاملات نظامية قابلة للضبط",
        "detail": "المدد والسقوف والمهل من لوحة إعدادات لا من الشيفرة — استعداداً لنظام التنفيذ الجديد",
        "kind": "infra",
        "route": "settings",
        "cells": {"mazad": "full", "aldal": "partial", "sumtek": "partial", "wasalt": "partial",
                  "saudi": "partial", "dar": "partial", "mubasher": "partial"},
    },
    {
        "key": "hitl",
        "title": "حلقة مراجعة بشرية إلزامية",
        "detail": "لا سعر يُعتمد ولا مزايد يُحظر دون قرار بشري مسجّل — امتثال لمبادئ سدايا",
        "kind": "infra",
        "route": "audit",
        "cells": {"mazad": "full", "aldal": "none", "sumtek": "none", "wasalt": "none",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
    {
        "key": "sharia",
        "title": "ضوابط شرعية مضمّنة في البنية",
        "detail": "لا حقل رسوم تأخير أصلاً، وإقرار عربون موثّق قبل أول مزايدة",
        "kind": "model",
        "route": "settings",
        "cells": {"mazad": "full", "aldal": "none", "sumtek": "none", "wasalt": "none",
                  "saudi": "none", "dar": "none", "mubasher": "none"},
    },
]

NOTE = (
    "خانات المنصات الأخرى مبنية على ما هو منشور علناً حتى تاريخ الإعداد. "
    "«جزئية أو غير مؤكدة علنياً» تعني أن القدرة غير موثّقة للعموم — لا أنها غائبة. "
    "وسم النوع مقصود: منطق القواعد ليس نموذجاً، وقرار الحوكمة ليس نموذجاً — "
    "وتقديمها كذكاء اصطناعي مبالغةٌ يلتقطها المحكّم التقني فوراً."
)


def payload():
    """Shape the matrix for the API, with a computed exclusivity summary."""
    exclusive = [
        f for f in FEATURES
        if f["cells"]["mazad"] == "full"
        and all(v == "none" for k, v in f["cells"].items() if k != "mazad")
    ]
    shared = [f for f in FEATURES if f not in exclusive]
    return {
        "platforms": PLATFORMS,
        "features": FEATURES,
        "kinds": KINDS,
        "levels": LEVELS,
        "note": NOTE,
        "summary": {
            "totalFeatures": len(FEATURES),
            "exclusiveCount": len(exclusive),
            "exclusiveKeys": [f["key"] for f in exclusive],
            "sharedCount": len(shared),
            "aiCount": len([f for f in FEATURES if f["kind"] == "ai"]),
        },
    }
