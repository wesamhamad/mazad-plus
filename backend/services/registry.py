"""طبقة الموصّلات للسجلات الرسمية — official-register connector layer.

الخدمة الأولى في مزاد+ («كشف الأصل») تستعلم أربعة سجلات رسمية بالتوازي.
None of those four is callable today by a private platform: three need a signed
integration agreement and the fourth is portal-only. So this module does the
one honest thing available — it defines the *interface* those integrations will
plug into, and ships simulated implementations behind it.

Why that is the right call and not a shortcut:

  * The interface is the deliverable. When إنفاذ grants access, a connector is
    replaced; nothing above this layer changes. That is exactly what Chapter 15
    of the study is asking for, made concrete.
  * Every response carries `mode` ("simulated" / "live"), `source`, and
    `fetched_at`. The UI is required to render those, so no field is ever shown
    without saying where it came from and when.
  * Faking a live connection would be the one thing a government evaluator is
    guaranteed to check. Declaring the simulation is worth more than hiding it.

Each connector returns a normalised envelope so the caller never learns the
shape of the upstream register:

    {"ok": bool, "mode": str, "source": str, "entity": str,
     "fetched_at": iso8601, "data": {...}, "note": str|None}
"""
import hashlib
from datetime import date, timedelta

from models import utcnow

SIMULATED = "simulated"


def _envelope(source, entity, data, mode=SIMULATED, ok=True, note=None):
    return {
        "ok": ok,
        "mode": mode,
        "source": source,
        "entity": entity,
        "fetchedAt": utcnow().isoformat(),
        "data": data,
        "note": note,
    }


def _seed(deed_or_ref):
    """Deterministic pseudo-randomness.

    The same deed number must always produce the same simulated answer —
    otherwise a disclosure would contradict itself between two page loads and
    the whole premise of a sealed report collapses.
    """
    return int(hashlib.sha256(str(deed_or_ref).encode()).hexdigest()[:8], 16)


class Connector:
    """Base connector. Subclasses implement `fetch`.

    The `status` / `blockers` / `evidence` fields are not decoration — they are
    the verified result of a research pass over each register, and they are what
    the platform shows instead of implying a live government link.
    """

    key = "base"
    name_ar = "—"
    entity = "—"
    identifier = "—"
    #: public_api | partner_api | agreement_required | manual_portal_only
    status = "agreement_required"
    onboarding = "—"
    blockers = "—"
    evidence = []
    confidence = "partial"

    def fetch(self, prop):  # pragma: no cover - interface
        raise NotImplementedError

    def describe(self):
        return {
            "key": self.key,
            "nameAr": self.name_ar,
            "entity": self.entity,
            "identifier": self.identifier,
            "mode": SIMULATED,
            "status": self.status,
            "onboarding": self.onboarding,
            "blockers": self.blockers,
            "evidence": self.evidence,
            "confidence": self.confidence,
        }


class NajizConnector(Connector):
    """سجل عيني العقار / ناجز — ownership, mortgages, seizures."""

    key = "najiz"
    name_ar = "سجل عيني العقار (ناجز)"
    entity = "وزارة العدل"
    identifier = "رقم الصك الإلكتروني (12 رقماً) + رقم هوية المالك"
    status = "partner_api"
    confidence = "partial"
    evidence = ["https://developers.najiz.sa/", "https://srem.moj.gov.sa/transactions-info"]
    blockers = (
        "بوابة مطوّري ناجز تعمل وتعرض 16 منتجاً، لكن كتالوجها المنشور يغطي التقاضي "
        "والتنفيذ والتوثيق — ولا يعرض علناً منتجاً مستقلاً للرهون والحجوزات والإفراغات، "
        "وهي بالضبط ما يحتاجه كشف الأصل. ولا تسجيل ذاتي ولا تسعير منشور."
    )
    onboarding = (
        "المسار الأقرب للتنفيذ ليس ناجز بل «واثق» (developer.wathq.sa): تسجيل ذاتي، "
        "منتج «الصكوك العقارية»، وباقة تجريبية مجانية 100 استعلام ثم من 5,000 ر.س/30 يوماً. "
        "أول خطوة عملية: استهلاك الباقة التجريبية للتأكد هل يعيد الرهون والحجوزات — "
        "وهذه أهم فجوة تقنية مفردة في المشروع."
    )

    def fetch(self, prop):
        if not prop.deed_number:
            return _envelope(self.name_ar, self.entity, None, ok=False,
                             note="لا يوجد رقم صك مسجّل لهذا الأصل — تعذّر الاستعلام")

        r = _seed(prop.deed_number)
        has_mortgage = r % 5 in (0, 1)          # ~40%
        executing = (r // 5) % 3 != 0           # most charges are the executing creditor's
        has_seizure = r % 11 == 0
        return _envelope(self.name_ar, self.entity, {
            # NOTE: the owner's identity is deliberately NOT returned. The rule
            # for this whole service is "show the state of the asset, not the
            # identity of the persons" — بيانات المالك والمدين شخصية بامتياز.
            "deedNumber": prop.deed_number,
            "areaSqm": prop.area_sqm,
            "mortgage": {
                "present": has_mortgage,
                "heldByExecutingCreditor": executing if has_mortgage else None,
                "amount": round((prop.estimated_value or 0) * 0.35, -3) if (has_mortgage and prop.estimated_value) else None,
            },
            "seizure": {"present": has_seizure},
            "pendingTransfer": {"present": r % 17 == 0},
        })


class EjarConnector(Connector):
    """شبكة إيجار — registered lease contracts.

    The highest-value field in the entire disclosure: a long registered lease
    is what makes an awarded property impossible to vacate, and it is the most
    common unpleasant surprise for auction buyers.
    """

    key = "ejar"
    name_ar = "شبكة إيجار"
    entity = "الهيئة العامة للعقار"
    identifier = "رقم العقد / رقم الهوية"
    status = "manual_portal_only"
    confidence = "partial"
    evidence = ["https://rega.gov.sa/rega-services/platforms/ejar/", "https://eservices.ejar.sa"]
    blockers = (
        "العائق نظامي لا تقني: الاستعلام عن عقود الإيجار متاح لأطراف العقد فقط بعد "
        "دخول عبر نفاذ. لا سند يتيح لطرف ثالث الاستعلام عن عقار لا يملكه — فحتى لو "
        "ظهرت واجهة برمجية لن تحل المشكلة."
    )
    onboarding = (
        "يُعاد تصميم المتطلب بدل انتظار ربط: إفصاح تعاقدي إلزامي من وكيل البيع عن وجود "
        "عقد إيجار ومدته، مُقراً به ومسجّلاً في سجل التدقيق — ويبقى الربط الآلي هدفاً "
        "لاحقاً باتفاقية مع الهيئة العامة للعقار."
    )

    def fetch(self, prop):
        if prop.asset_type != "عقار":
            return _envelope(self.name_ar, self.entity, {"lease": {"present": False}},
                             note="لا ينطبق على المنقولات")

        r = _seed(prop.ref + "ejar")
        has_lease = r % 4 in (0, 1)             # ~50% of properties are tenanted
        if not has_lease:
            return _envelope(self.name_ar, self.entity, {"lease": {"present": False}})

        months = 6 + (r % 108)                  # 6 … 113 months remaining
        return _envelope(self.name_ar, self.entity, {
            "lease": {
                "present": True,
                "endsOn": (date.today() + timedelta(days=months * 30)).isoformat(),
                "monthsRemaining": months,
                "registered": True,
            }
        })


class EnforcementConnector(Connector):
    """إنفاذ / محكمة التنفيذ — execution file status and objections."""

    key = "enforcement"
    name_ar = "محكمة التنفيذ (إنفاذ)"
    entity = "وزارة العدل — مركز الإسناد والتصفية"
    identifier = "رقم طلب التنفيذ"
    status = "agreement_required"
    confidence = "verified"
    evidence = ["https://infath.gov.sa/ar/electronic-services/infath-auctions/"]
    blockers = (
        "لا واجهة برمجية منشورة لإنفاذ إطلاقاً ولا بوابة مطوّرين. وصفحة «مزود خدمة "
        "المزاد الإلكتروني» ما تزال تُعيد 404 بالعربية والإنجليزية معاً — أي أن باب "
        "الاعتماد قد يكون مغلقاً أو قيد إعادة هيكلة. سؤال وجودي يسبق أي استثمار هندسي."
    )
    onboarding = (
        "اطلب كتابياً من المركز: النسخة الحالية من دليل اعتماد المنصات، وهل باب الاعتماد "
        "مفتوح أصلاً، وواجهة برمجية لبيانات المزادات، ومَن يتحمل التحقق من خلو الأصل من "
        "الموانع — المنصة أم المركز."
    )

    def fetch(self, prop):
        r = _seed(prop.ref + "enf")
        has_objection = r % 9 == 0
        stages = ["الإعلان", "التقييم", "الطرح للمزايدة", "الترسية", "التسليم"]
        return _envelope(self.name_ar, self.entity, {
            "executionRequestNo": f"{2026}{(r % 900000) + 100000}",
            "stage": stages[r % len(stages)],
            # The creditor's identity is not returned — same rule as ناجز.
            "objection": {"present": has_objection,
                          "detail": "اعتراض قائم على إجراءات الطرح" if has_objection else None},
        })


class QeemaConnector(Connector):
    """قيم — accredited valuation report registry."""

    key = "qeema"
    name_ar = "قيم — الهيئة السعودية للمقيمين المعتمدين"
    entity = "تقييم (TAQEEM)"
    identifier = "رقم العضوية / رقم تقرير التقييم"
    status = "manual_portal_only"
    confidence = "partial"
    evidence = ["https://taqeem.gov.sa/en", "https://qima.taqeem.sa/common/notice"]
    blockers = (
        "لا بوابة مطوّرين ولا كتالوج واجهات للهيئة. منصة «قيمة» تشترط دخولاً عبر نفاذ "
        "فهي بوابة بشرية بالكامل، ولا خدمة عامة للتحقق من صلاحية تقرير برقمه."
    )
    onboarding = (
        "في المدى القريب: تحقق بشري من دليل الهيئة أو بطلب صورة الترخيص من المقيّم، "
        "مع تسجيل نتيجة التحقق في سجل التدقيق. الربط يحتاج مراسلة الهيئة."
    )

    def fetch(self, prop):
        r = _seed(prop.ref + "qeema")
        age_days = r % 400
        methods = ["المقارنة", "الدخل", "التكلفة"]
        return _envelope(self.name_ar, self.entity, {
            "report": {
                "present": True,
                "valuationDate": (date.today() - timedelta(days=age_days)).isoformat(),
                "ageDays": age_days,
                "valuerLicence": f"12100{(r % 9000) + 1000}",
                "method": methods[r % len(methods)],
                "urgentSaleDiscountApplied": r % 3 == 0,
            }
        })


CONNECTORS = [NajizConnector(), EjarConnector(), EnforcementConnector(), QeemaConnector()]
BY_KEY = {c.key: c for c in CONNECTORS}


def query_all(prop):
    """Run every connector for one property and return keyed envelopes.

    In production these four are issued concurrently — they are independent
    network calls and the user is waiting on the slowest, not the sum.
    """
    return {c.key: c.fetch(prop) for c in CONNECTORS}


def describe_all():
    """The integration register, for the UI and for Chapter 15 of the study."""
    return [c.describe() for c in CONNECTORS]


# ---------------------------------------------------------------------------
# نتائج مسح المصادر — verified findings that belong in Chapter 15 of the study
# ---------------------------------------------------------------------------
CHAPTER_15_ASKS = [
    "النسخة الحالية من دليل اعتماد منصات المزادات الإلكترونية — الصفحة العامة تُعيد 404 بالعربية والإنجليزية، فلا يصح بناء فصل الامتثال على صفحة مفهرسة ميتة.",
    "هل باب اعتماد المنصات الجديدة مفتوح أصلاً اليوم؟ سابقة «مباشر» كرابع منصة تشير إلى عدد منضبط لا سوق مفتوح — سؤال وجودي يسبق أي استثمار هندسي.",
    "واجهة برمجية أو تغذية منظمة لبيانات المزادات (الأصول المطروحة، المواعيد، النتائج) — لا يوجد أي API منشور لإنفاذ، وهذا أهم طلب تقني مفرد.",
    "مَن يتحمل التحقق من خلو الأصل من الرهون والحجوزات والإفراغات: المركز أم المنصة؟ الإجابة تحدد هل ربط السجل العيني شرط حاسم أم تحسين اختياري.",
    "نموذج التعاقد والعوائد — المنصة تتحمل كامل تكاليف الإنشاء والتشغيل والتسويق، فيجب تثبيت مصدر الإيراد كتابياً قبل الالتزام.",
    "متطلبات الأمن السيبراني والحوكمة بالتفصيل — «خلو المنصة من المخاطر» صياغة تخفي وراءها امتثالاً للهيئة الوطنية للأمن السيبراني واستضافة داخل المملكة.",
    "آلية ربط هوية المزايدين — هل يفرض المركز نفاذ؟ إن فرضه فقد يوفّر مساراً أسرع للانضمام من التقديم المستقل.",
]

#: الافتراضات التي قلبها المسح
ASSUMPTION_CHANGES = [
    {
        "finding": "«واثق» هو المسار الواقعي لبيانات الصك — لا ناجز",
        "detail": "developer.wathq.sa تسجيل ذاتي حقيقي، منتج «الصكوك العقارية»، تسعير منشور "
                  "(تجريبي مجاني 100 استعلام ثم من 5,000 ر.س/30 يوماً) وبلا بوابة اتفاقية. "
                  "لم يكن في الافتراض الأصلي، وهو أهم اكتشاف قابل للتنفيذ.",
        "impact": "positive",
    },
    {
        "finding": "مصدر المقارنات «المشروع غير المكشوط» غير مُثبت",
        "detail": "رابط بيانات الصفقات المفتوحة يعيد تحويلاً إلى جذر البوابة، والبوابة الجديدة "
                  "تحجب كل وصول آلي خلف جدار حماية، وعرض وزارة العدل لوحات Power BI لا تنزيلاً "
                  "منظماً. هذا يقلب أحد افتراضات المشروع الأساسية ويحتاج تحققاً بشرياً فورياً.",
        "impact": "critical",
    },
    {
        "finding": "إيجار مغلق نظامياً لا تقنياً",
        "detail": "الاستعلام متاح لأطراف العقد فقط. لا سند لطرف ثالث يستعلم عن عقار لا يملكه — "
                  "فحتى ظهور واجهة برمجية لن يحل المشكلة. البديل: إفصاح تعاقدي إلزامي من الوكيل.",
        "impact": "critical",
    },
    {
        "finding": "الاستعلام عن الصك تحقّق لا بحث",
        "detail": "كل خدمة فُحصت تشترط رقم هوية المالك مع رقم الصك. لا توجد خدمة تتيح البحث برقم "
                  "الصك وحده — أي أن منطق المنتج يجب أن يفترض أن البائع يقدّم بياناته ثم نتحقق "
                  "منها، لا أن نكتشفها ابتداءً.",
        "impact": "design",
    },
]
