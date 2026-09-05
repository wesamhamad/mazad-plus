"""محرّك الأعلام — pre-bid red/amber flag engine.

قواعد صريحة، لا نموذج لغوي. عمداً.

A bidder is about to commit a deposit on a judicial asset. If the platform
tells them "this property cannot be vacated", that statement has to be
traceable to a named field from a named register on a named date — which a
rule can do and a language model cannot. Every flag below therefore carries
the rule that fired it and the source it read.

The severity split matters as much as the rules:
  ⛔ أحمر   — a condition that survives the award and lands on the buyer
  ⚠️ برتقالي — a gap in the evidence, not a defect in the asset
"""
from datetime import date

RED = "red"
AMBER = "amber"

# The lease horizon beyond which vacating becomes the buyer's problem rather
# than a formality. Two years is the line the study draws.
LEASE_BLOCKING_MONTHS = 24
VALUATION_STALE_DAYS = 180
AREA_TOLERANCE = 0.05  # 5% between deed and inspection is measurement noise


def _months_between(d):
    today = date.today()
    return (d.year - today.year) * 12 + (d.month - today.month)


def evaluate(prop, registry_results):
    """Return a list of flags from the four register responses.

    `registry_results` is the dict returned by services.registry.query_all.
    """
    flags = []

    def add(level, code, title, detail, source, rule):
        flags.append({
            "level": level, "code": code, "title": title,
            "detail": detail, "source": source, "rule": rule,
        })

    najiz = registry_results.get("najiz", {})
    ejar = registry_results.get("ejar", {})
    enf = registry_results.get("enforcement", {})
    qeema = registry_results.get("qeema", {})

    # ------------------------------------------------ 1. long registered lease
    lease = (ejar.get("data") or {}).get("lease") or {}
    if lease.get("present") and lease.get("endsOn"):
        months = _months_between(date.fromisoformat(lease["endsOn"]))
        if months > LEASE_BLOCKING_MONTHS:
            add(RED, "lease_blocking", "تعذّر الإخلاء — عقد إيجار طويل مسجّل",
                f"عقد إيجار موثّق ينتهي في {lease['endsOn']} — أي بعد نحو {months} شهراً. "
                "الترسية لا تُنهي عقد الإيجار المسجّل، والعقار ينتقل إليك مشغولاً.",
                ejar.get("source"), f"مدة الإيجار المتبقية > {LEASE_BLOCKING_MONTHS} شهراً")
        else:
            add(AMBER, "lease_short", "عقار مؤجَّر — مدة قصيرة",
                f"عقد إيجار موثّق ينتهي في {lease['endsOn']} (نحو {months} شهراً). "
                "احسب فترة الانتظار حتى الإخلاء ضمن تكلفتك الكلية.",
                ejar.get("source"), f"مدة الإيجار المتبقية ≤ {LEASE_BLOCKING_MONTHS} شهراً")

    # -------------------------------------- 2. charge held by a third creditor
    mortgage = (najiz.get("data") or {}).get("mortgage") or {}
    if mortgage.get("present"):
        if mortgage.get("heldByExecutingCreditor") is False:
            add(RED, "mortgage_third_party", "رهن قائم لغير الدائن المنفَّذ له",
                "على الأصل رهن لجهة غير الدائن الذي يُنفَّذ لصالحه. "
                "قرار الترسية يطهّر المال من استحقاق الدائن المنفَّذ له، ولا يُفترض "
                "أنه يُسقط رهناً لطرف ثالث — راجع وضعك النظامي قبل المزايدة.",
                najiz.get("source"), "رهن قائم ومالكه ليس الدائن المنفَّذ له")
        else:
            add(AMBER, "mortgage_executing", "رهن قائم للدائن المنفَّذ له",
                "الرهن لصالح الدائن الذي يُنفَّذ له، ويُتوقع سقوطه بالترسية — "
                "لكن تأكّد من ذلك في قرار الترسية نفسه.",
                najiz.get("source"), "رهن قائم لصالح الدائن المنفَّذ له")

    # ------------------------------------------------------------ 3. seizure
    if ((najiz.get("data") or {}).get("seizure") or {}).get("present"):
        add(RED, "seizure", "حجز قائم على الأصل",
            "يوجد حجز مسجّل على الأصل في السجل العيني — قد يعطّل الإفراغ بعد الترسية.",
            najiz.get("source"), "وجود حجز مسجّل")

    # ------------------------------------------------ 4. live objection/dispute
    objection = (enf.get("data") or {}).get("objection") or {}
    if objection.get("present"):
        add(RED, "objection", "اعتراض قائم على إجراءات التنفيذ",
            f"{objection.get('detail') or 'اعتراض مسجّل'} — قد يوقف الطرح أو يُلغي الترسية.",
            enf.get("source"), "وجود اعتراض قائم في ملف التنفيذ")

    # --------------------------------------------------- 5. stale valuation
    report = (qeema.get("data") or {}).get("report") or {}
    if not report.get("present"):
        add(AMBER, "no_valuation", "لا يوجد تقرير تقييم معتمد",
            "لم يُعثر على تقرير تقييم في سجل قيم — سعر الافتتاح بلا مرجع تقييمي موثّق.",
            qeema.get("source"), "غياب تقرير تقييم")
    elif (report.get("ageDays") or 0) > VALUATION_STALE_DAYS:
        add(AMBER, "valuation_stale", "تقرير التقييم غير حديث",
            f"آخر تقييم معتمد بتاريخ {report.get('valuationDate')} — "
            f"أي قبل {report.get('ageDays')} يوماً، ويتجاوز نافذة {VALUATION_STALE_DAYS} يوماً.",
            qeema.get("source"), f"عمر التقييم > {VALUATION_STALE_DAYS} يوماً")
    if report.get("urgentSaleDiscountApplied"):
        add(AMBER, "urgent_sale", "طُبِّق تحفّظ «البيع المستعجل» في التقييم",
            "القيمة التقديرية مبنية على فرضية بيع مستعجل، وهي أدنى من القيمة السوقية "
            "المفتوحة — وهذا يفسّر جزءاً من الفارق قبل أن تعدّه فرصة.",
            qeema.get("source"), "تحفّظ البيع المستعجل مُطبَّق")

    # ------------------------------------ 6. deed vs inspection area mismatch
    deed_area = (najiz.get("data") or {}).get("areaSqm")
    if deed_area and prop.area_sqm:
        gap = abs(deed_area - prop.area_sqm) / prop.area_sqm
        if gap > AREA_TOLERANCE:
            add(AMBER, "area_mismatch", "تعارض في المساحة بين الصك والمعاينة",
                f"الصك {deed_area:,.0f} م² مقابل {prop.area_sqm:,.0f} م² في المعاينة "
                f"(فارق {gap:.0%}).",
                najiz.get("source"), f"فارق المساحة > {AREA_TOLERANCE:.0%}")

    return flags


def summarize(flags):
    reds = [f for f in flags if f["level"] == RED]
    ambers = [f for f in flags if f["level"] == AMBER]
    if reds:
        verdict, tone = "لا تُزايد قبل مراجعة قانونية", "error"
    elif ambers:
        verdict, tone = "قابل للمزايدة مع تحفّظات", "warning"
    else:
        verdict, tone = "لا قيود ظاهرة", "success"
    return {"red": len(reds), "amber": len(ambers), "verdict": verdict, "tone": tone}
