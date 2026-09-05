"""
تهيئة قاعدة البيانات وبذر البيانات التجريبية — مزاد+
Creates mazad_plus.db and seeds a full demo dataset.

Run:  python seed.py     (safe to re-run — it rebuilds from scratch)

The closed auctions here are not decoration: the pricing engine builds its
comparables from them, so the size and spread of this dataset is what makes
the valuations look like valuations rather than constants.
"""
import json
import math
import os
import random
from datetime import date, datetime, timedelta, timezone

from app import DB_PATH, app  # noqa: E402  (circular-safe: app defined before bootstrap)
from models import (Auction, Bid, Deposit, District, Document, Encumbrance, PropertyPhoto,
                    FraudAlert, MarketIndicator, Notification, Payment,
                    Property, Setting, User, db, utcnow)
from services import audit, geo, pricing, readiness, registry
from models import CityProfile

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

TODAY = date.today()
rng = random.Random(20260904)

# --- regulatory parameters -------------------------------------------------
SETTINGS = [
    dict(key="notice_days", value=5, unit="يوم",
         title="الحد الأدنى لمدة الإعلان قبل المزاد",
         description="اللائحة التنظيمية للمزادات العقارية تشترط الإعلان قبل خمسة أيام بحد أدنى، "
                     "والغرض منه اتساع دائرة المشاركة.",
         basis="اللائحة التنظيمية للمزادات العقارية — الهيئة العامة للعقار"),
    dict(key="deposit_cap_pct", value=5, unit="%",
         title="سقف العربون من القيمة التقديرية",
         description="لا يتجاوز 5% في الأصول العقارية. يُوصف «عربون متفق عليه» لا «غرامة» — "
                     "فالتكييف يغيّر الحكم الشرعي.",
         basis="اللائحة التنظيمية للمزادات العقارية"),
    dict(key="payment_days", value=10, unit="يوم",
         title="مهلة سداد الثمن بعد الترسية",
         description="قابلة للتغيير مع صدور اللائحة التنفيذية لنظام التنفيذ الجديد (م/237) "
                     "الذي يُعمل به قرابة 28 أكتوبر 2026.",
         basis="نظام التنفيذ الجديد — المرسوم الملكي م/237"),
    dict(key="readiness_threshold", value=70, unit="نقطة",
         title="حد درجة الجاهزية للسماح بالطرح",
         description="الأصول الأقل من هذا الحد تُحجب آلياً عن النشر حتى تكتمل مستنداتها. "
                     "الحجب آلي، ورفعه قرار بشري مسجّل.",
         basis="قرار تصميمي — منع طرح الأصول ناقصة البيانات"),
    dict(key="min_increment_pct", value=1, unit="%",
         title="الحد الأدنى لمقدار الزيادة في المزايدة",
         description="نسبة من السعر الحالي، تُضبط لكل فئة أصول.",
         basis="قاعدة تشغيلية قابلة للضبط"),
]

# --- demo identities -------------------------------------------------------
USERS = [
    dict(national_id="1023456780", full_name="عبدالله الشهري", role="agent",
         role_label="وكيل بيع", organization="مؤسسة الشهري للمزادات",
         license_no="فال 1200018842", phone_masked="•••• ••• 4417"),
    dict(national_id="1098765432", full_name="منى القحطاني", role="appraiser",
         role_label="مُقيّم معتمد", organization="لجنة التقييم — مزاد+",
         license_no="تقييم 1210004417", phone_masked="•••• ••• 2290"),
    dict(national_id="1055501234", full_name="سلطان الدوسري", role="compliance",
         role_label="مشرف الامتثال", organization="إدارة المنصة",
         license_no="—", phone_masked="•••• ••• 7731"),
    dict(national_id="1077003311", full_name="نورة العتيبي", role="agent",
         role_label="وكيل بيع", organization="شركة الميدان للتصفية",
         license_no="فال 1200021907", phone_masked="•••• ••• 5502"),
    dict(national_id="1116179191", full_name="وسام حمد الجريش", role="compliance",
         role_label="مشرف الامتثال", organization="مزاد+ — الإدارة",
         license_no="—", phone_masked="•••• ••• ••••"),
    dict(national_id="2011223344", full_name="راشد الحربي", role="bidder",
         role_label="مزايد", organization="—", license_no="—",
         phone_masked="•••• ••• 8865"),
]

PLATFORMS = ["مباشر", "دار المزادات", "السعودية للمزادات", "وصلت مزادات", "سومتك", "الدال"]

REAL_ESTATE_DOCS = [
    ("deed", "صك الملكية", True),
    ("inspection", "تقرير المعاينة", True),
    ("photos", "الصور الفوتوغرافية", True),
    ("sitemap", "كروكي الموقع", True),
    ("dues", "إفادة الرسوم والمخالفات", False),
]
MOVABLE_DOCS = [
    ("ownership", "استمارات الملكية", True),
    ("inspection", "تقرير الفحص الفني", True),
    ("photos", "الصور الفوتوغرافية", True),
    ("violations", "إفادة المخالفات المرورية", False),
]
EQUIPMENT_DOCS = [
    ("ownership", "إثبات الملكية", True),
    ("inspection", "تقرير الفحص الفني", True),
    ("photos", "الصور الفوتوغرافية", True),
    ("customs", "البيان الجمركي", False),
]


SUBTYPE_RULES = [
    ("فيلا", "فيلا"), ("شقة", "شقة"), ("عمارة", "عمارة"), ("مستودع", "مستودع"),
    ("محل", "محل تجاري"), ("أرض تجارية", "أرض تجارية"), ("أرض صناعية", "أرض صناعية"),
    ("أرض زراعية", "أرض زراعية"), ("أرض سكنية", "أرض سكنية"),
    ("مركبة", "مركبات"), ("معدات", "معدات"), ("مواشٍ", "مواشٍ"),
]


def subtype_for(title):
    """Derive the asset sub-class from the title.

    In production this is a field the agent picks; here it is inferred so the
    seed stays readable, and it is what the pricing engine matches comparables on.
    """
    for needle, label in SUBTYPE_RULES:
        if needle in title:
            return label
    return "أخرى"


def docs_for(asset_type, title):
    if asset_type == "منقولات":
        return EQUIPMENT_DOCS if ("معدات" in title or "مواشٍ" in title) else MOVABLE_DOCS
    return REAL_ESTATE_DOCS


# ref, title, type, city, district, area, value, inspected_days_ago, condition, missing docs
P = [
    # ---- الرياض ----
    ("AST-2140", "عمارة سكنية — حي الفيصلية", "عقار", "الرياض", "الفيصلية", 860, 4_200_000, 36, "ممتازة", []),
    ("AST-2201", "شقة سكنية — حي النرجس", "عقار", "الرياض", "النرجس", 168, 690_000, 13, "جيدة — تشطيب كامل", []),
    ("AST-2247", "مستودع صناعي — الصناعية الثانية", "عقار", "الرياض", "الصناعية الثانية", 2400, 3_100_000, 140, "تحتاج صيانة سقف", []),
    ("AST-2260", "شقة سكنية — حي الملقا", "عقار", "الرياض", "الملقا", 175, 705_000, 21, "ممتازة", []),
    ("AST-2266", "فيلا سكنية — حي الياسمين", "عقار", "الرياض", "الياسمين", 380, 1_780_000, 9, "جيدة جداً", []),
    ("AST-2271", "أرض سكنية — حي القيروان", "عقار", "الرياض", "القيروان", 750, 1_425_000, 27, "أرض بيضاء", []),
    ("AST-2288", "محل تجاري — طريق العليا", "عقار", "الرياض", "العليا", 120, 2_350_000, 18, "جيدة — واجهة زجاجية", []),
    ("AST-2294", "عمارة سكنية — حي الروضة", "عقار", "الرياض", "الروضة", 720, 3_650_000, 44, "جيدة", []),
    ("AST-2303", "شقة سكنية — حي حطين", "عقار", "الرياض", "حطين", 155, 655_000, 6, "ممتازة", []),
    ("AST-2311", "دفعة معدات ثقيلة — 6 قطع", "منقولات", "الرياض", "—", None, 1_950_000, 11, "تشغيلية — ساعات عمل متوسطة", []),
    ("AST-2318", "مستودع لوجستي — الصناعية الأولى", "عقار", "الرياض", "الصناعية الأولى", 3100, 4_450_000, 31, "ممتازة", []),

    # ---- مكة المكرمة ----
    ("AST-2185", "فيلا سكنية — حي الشوقية", "عقار", "مكة المكرمة", "الشوقية", 420, 1_950_000, 17, "ممتازة — لا ملاحظات جوهرية", []),
    ("AST-2222", "فيلا سكنية — حي العتيبية", "عقار", "مكة المكرمة", "العتيبية", 405, 1_880_000, 52, "جيدة", []),
    ("AST-2239", "شقة سكنية — حي الششة", "عقار", "مكة المكرمة", "الششة", 148, 585_000, 24, "جيدة", []),
    ("AST-2255", "فيلا سكنية — حي النوارية", "عقار", "مكة المكرمة", "النوارية", 440, 2_050_000, 15, "ممتازة", []),
    ("AST-2277", "أرض تجارية — طريق الحج", "عقار", "مكة المكرمة", "الرصيفة", 980, 2_640_000, 63, "أرض بيضاء", []),

    # ---- جدة ----
    ("AST-2214", "أرض تجارية — طريق الملك عبدالعزيز", "عقار", "جدة", "الروضة", 1250, 1_325_000, None, None, ["deed", "sitemap"]),
    ("AST-2245", "شقة سكنية — حي السلامة", "عقار", "جدة", "السلامة", 160, 620_000, 20, "جيدة", []),
    ("AST-2281", "أرض تجارية — حي المروة", "عقار", "جدة", "المروة", 1310, 1_380_000, 40, "أرض بيضاء", []),
    ("AST-2299", "فيلا سكنية — حي الشاطئ", "عقار", "جدة", "الشاطئ", 460, 2_780_000, 12, "ممتازة", []),

    # ---- الشرقية ----
    ("AST-2229", "دفعة منقولات — 12 مركبة", "منقولات", "الدمام", "—", None, 1_180_000, 5, "جيدة — خدوش سطحية على 3 مركبات", []),
    ("AST-2258", "دفعة منقولات — 8 مركبات", "منقولات", "الدمام", "—", None, 795_000, 33, "جيدة", []),
    ("AST-2273", "فيلا سكنية — حي الفيصلية", "عقار", "الخبر", "الفيصلية", 400, 1_690_000, 19, "جيدة جداً", []),
    ("AST-2290", "شقة سكنية — حي الراكة", "عقار", "الخبر", "الراكة", 152, 575_000, 47, "جيدة", []),
    ("AST-2308", "أرض صناعية — الجبيل", "عقار", "الجبيل", "الصناعية", 4200, 3_360_000, None, "أرض بيضاء", ["inspection"]),

    # ---- المدينة المنورة والقصيم ----
    ("AST-2233", "فيلا سكنية — حي العزيزية", "عقار", "المدينة المنورة", "العزيزية", 390, 1_540_000, 26, "جيدة", []),
    ("AST-2262", "شقة سكنية — حي الدفاع", "عقار", "المدينة المنورة", "الدفاع", 145, 520_000, 58, "مقبولة", []),
    ("AST-2286", "أرض زراعية — بريدة", "عقار", "بريدة", "الشماس", 12000, 2_160_000, 22, "أرض زراعية مستصلحة", []),
    ("AST-2301", "دفعة مواشٍ — 240 رأساً", "منقولات", "بريدة", "—", None, 468_000, 3, "سليمة — شهادة بيطرية سارية", []),

    # ---- عسير ----
    ("AST-2296", "فيلا سكنية — أبها", "عقار", "أبها", "المنسك", 355, 1_320_000, 29, "جيدة", []),
    ("AST-2313", "أرض سكنية — خميس مشيط", "عقار", "خميس مشيط", "الواحة", 700, 630_000, 175, "أرض بيضاء", []),

    # ==== أصول مضافة في المناطق الثلاث التي جُمعت بياناتها ====
    # الرياض — أحياء لها متوسط سعر متر منشور
    ("AST-2401", "أرض سكنية — حي حطين", "عقار", "الرياض", "حطين", 640, 3_100_000, 14, "أرض بيضاء", []),
    ("AST-2402", "فيلا سكنية — حي الصحافة", "عقار", "الرياض", "الصحافة", 410, 2_050_000, 22, "جيدة جداً", []),
    ("AST-2403", "أرض سكنية — حي العارض", "عقار", "الرياض", "العارض", 900, 3_450_000, 41, "أرض بيضاء", []),
    ("AST-2404", "فيلا سكنية — حي قرطبة", "عقار", "الرياض", "قرطبة", 375, 1_460_000, 8, "ممتازة", []),
    ("AST-2405", "أرض سكنية — حي طويق", "عقار", "الرياض", "طويق", 600, 1_020_000, 33, "أرض بيضاء", []),
    ("AST-2406", "شقة سكنية — حي إشبيلية", "عقار", "الرياض", "إشبيلية", 150, 395_000, 19, "جيدة", []),
    # القصيم
    ("AST-2411", "فيلا سكنية — حي النهضة، بريدة", "عقار", "بريدة", "النهضة", 400, 920_000, 16, "جيدة جداً", []),
    ("AST-2412", "أرض سكنية — حي الريان، بريدة", "عقار", "بريدة", "الريان", 625, 1_340_000, 25, "أرض بيضاء", []),
    ("AST-2413", "أرض سكنية — حي الرحاب، بريدة", "عقار", "بريدة", "الرحاب", 700, 690_000, 48, "أرض بيضاء", []),
    ("AST-2414", "فيلا سكنية — حي المنار، عنيزة", "عقار", "عنيزة", "المنار", 380, 780_000, 12, "جيدة", []),
    ("AST-2415", "أرض سكنية — حي الفاخرية، عنيزة", "عقار", "عنيزة", "الفاخرية", 550, 470_000, 61, "أرض بيضاء", []),
    ("AST-2416", "أرض زراعية — وادي الرمة، الرس", "عقار", "الرس", "وادي الرمة", 25000, 1_150_000, 30, "أرض زراعية مستصلحة", []),
    # عسير
    ("AST-2421", "فيلا سكنية — حي المروج، أبها", "عقار", "أبها", "المروج", 340, 840_000, 10, "ممتازة", []),
    ("AST-2422", "أرض سكنية — حي الربوة، أبها", "عقار", "أبها", "الربوة", 500, 1_180_000, 37, "أرض بيضاء", []),
    ("AST-2423", "استراحة — حي السوسن، أبها", "عقار", "أبها", "السوسن", 3000, 760_000, 21, "استراحة بمسبح ومجلس", []),
    ("AST-2424", "فيلا سكنية — حي اليرموك، خميس مشيط", "عقار", "خميس مشيط", "اليرموك", 390, 1_150_000, 18, "جيدة جداً", []),
    ("AST-2425", "أرض سكنية — حي الظرفة، خميس مشيط", "عقار", "خميس مشيط", "الظرفة", 560, 1_130_000, 55, "أرض بيضاء", []),
]

# code, ref, status, ends_in_minutes, platform_index
A = [
    # live
    ("AUC-2026-0814", "AST-2185", "live", 52, 0),
    ("AUC-2026-0821", "AST-2201", "live", 14, 1),
    ("AUC-2026-0847", "AST-2266", "live", 96, 4),
    ("AUC-2026-0851", "AST-2311", "live", 38, 2),
    # upcoming
    ("AUC-2026-0840", "AST-2229", "upcoming", 60 * 32, 2),
    ("AUC-2026-0852", "AST-2247", "upcoming", 60 * 90, 0),
    ("AUC-2026-0856", "AST-2288", "upcoming", 60 * 50, 3),
    ("AUC-2026-0861", "AST-2299", "upcoming", 60 * 74, 1),
    ("AUC-2026-0864", "AST-2301", "upcoming", 60 * 20, 5),
    ("AUC-2026-0868", "AST-2318", "upcoming", 60 * 120, 0),
    # blocked (readiness decides — these are the incomplete ones)
    ("AUC-2026-0833", "AST-2214", "upcoming", 60 * 118, 4),
    ("AUC-2026-0870", "AST-2308", "upcoming", 60 * 140, 3),
    ("AUC-2026-0873", "AST-2313", "upcoming", 60 * 160, 5),
    # closed — these feed the comparables engine
    ("AUC-2026-0790", "AST-2140", "closed", -60 * 20, 0),
    ("AUC-2026-0762", "AST-2222", "closed", -60 * 96, 1),
    ("AUC-2026-0771", "AST-2260", "closed", -60 * 140, 0),
    ("AUC-2026-0745", "AST-2255", "closed", -60 * 210, 2),
    ("AUC-2026-0738", "AST-2239", "closed", -60 * 260, 3),
    ("AUC-2026-0727", "AST-2245", "closed", -60 * 300, 1),
    ("AUC-2026-0719", "AST-2281", "closed", -60 * 340, 4),
    ("AUC-2026-0704", "AST-2294", "closed", -60 * 400, 0),
    ("AUC-2026-0698", "AST-2271", "closed", -60 * 460, 5),
    ("AUC-2026-0684", "AST-2273", "closed", -60 * 520, 2),
    ("AUC-2026-0677", "AST-2290", "closed", -60 * 580, 3),
    ("AUC-2026-0669", "AST-2258", "closed", -60 * 640, 2),
    ("AUC-2026-0655", "AST-2233", "closed", -60 * 700, 1),
    ("AUC-2026-0641", "AST-2262", "closed", -60 * 760, 4),
    ("AUC-2026-0630", "AST-2286", "closed", -60 * 820, 5),
    ("AUC-2026-0618", "AST-2296", "closed", -60 * 900, 3),
    ("AUC-2026-0607", "AST-2303", "closed", -60 * 980, 0),
    ("AUC-2026-0592", "AST-2277", "closed", -60 * 1060, 1),

    # ==== مزادات الأصول المضافة ====
    ("AUC-2026-0901", "AST-2401", "live", 68, 0),
    ("AUC-2026-0902", "AST-2411", "live", 27, 3),
    ("AUC-2026-0903", "AST-2421", "live", 110, 5),
    ("AUC-2026-0904", "AST-2402", "upcoming", 60 * 44, 1),
    ("AUC-2026-0905", "AST-2412", "upcoming", 60 * 62, 2),
    ("AUC-2026-0906", "AST-2422", "upcoming", 60 * 86, 4),
    ("AUC-2026-0907", "AST-2423", "upcoming", 60 * 30, 5),
    ("AUC-2026-0908", "AST-2424", "upcoming", 60 * 100, 0),
    ("AUC-2026-0911", "AST-2403", "closed", -60 * 30, 0),
    ("AUC-2026-0912", "AST-2404", "closed", -60 * 72, 1),
    ("AUC-2026-0913", "AST-2405", "closed", -60 * 130, 2),
    ("AUC-2026-0914", "AST-2406", "closed", -60 * 190, 3),
    ("AUC-2026-0915", "AST-2413", "closed", -60 * 250, 4),
    ("AUC-2026-0916", "AST-2414", "closed", -60 * 310, 5),
    ("AUC-2026-0917", "AST-2415", "closed", -60 * 370, 0),
    ("AUC-2026-0918", "AST-2416", "closed", -60 * 430, 1),
    ("AUC-2026-0919", "AST-2425", "closed", -60 * 490, 2),
]


with open(os.path.join(DATA_DIR, "city_centers.json"), encoding="utf-8") as _fh:
    CITY_CENTERS = {k: v for k, v in json.load(_fh).items() if not k.startswith("_")}

SUBTYPE_TYPE = {"مركبات": "منقولات", "معدات": "منقولات", "مواشٍ": "منقولات"}
DOC_SETS = {"منقولات": MOVABLE_DOCS}


def load_collected_auctions():
    """Load real published auction records from data/auctions_*.json.

    These come from the research agents: each record keeps its source URL and a
    measured/estimated tag. Records without a usable price are still loaded
    (the listing is real) but never priced; records are never invented here.
    """
    out = []
    if not os.path.isdir(DATA_DIR):
        return out
    for fname in sorted(os.listdir(DATA_DIR)):
        if not (fname.startswith("auctions_") and fname.endswith(".json")):
            continue
        try:
            with open(os.path.join(DATA_DIR, fname), encoding="utf-8") as fh:
                doc = json.load(fh)
        except (OSError, ValueError) as exc:
            print(f"  ! تخطّي {fname}: {exc}")
            continue
        for rec in doc.get("records", []):
            if not rec.get("title") or not rec.get("city"):
                continue  # no city → cannot be placed or compared; the aggregate still counts
            # "الخرج (الحياثم)" → "الخرج": the parenthetical is a locality, not a city
            rec["city"] = rec["city"].split("(")[0].strip()
            out.append(rec)
    return out


def _iso_to_dt(value):
    if not value:
        return None
    try:
        d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        try:
            return datetime.combine(date.fromisoformat(str(value)[:10]), datetime.min.time(), tzinfo=timezone.utc)
        except ValueError:
            return None


def load_geo():
    """حمّل الأحياء والمؤشرات من ملفات الوكلاء في data/.

    These files are the output of the research pass: district coordinates and
    published median SAR/m², each row carrying its own source and a
    measured/estimated tag. Nothing here is invented at seed time — a district
    with no published figure is loaded with a null price and stays null, which
    is what makes the map honest about where it does and does not know.
    """
    districts, indicators, sources, gaps = [], [], [], []
    if not os.path.isdir(DATA_DIR):
        return districts, indicators, sources, gaps

    for fname in sorted(os.listdir(DATA_DIR)):
        if not fname.endswith(".json"):
            continue
        with open(os.path.join(DATA_DIR, fname), encoding="utf-8") as fh:
            doc = json.load(fh)
        if not isinstance(doc, dict):
            continue  # city_profiles.json and other list-shaped files are loaded elsewhere
        region = doc.get("region", "—")
        for city in doc.get("cities", []):
            for d in city.get("districts", []):
                districts.append(District(
                    region=region, city=city["city"], name=d["name"],
                    lat=d.get("lat"), lng=d.get("lng"),
                    land_sar_sqm=d.get("land_sar_sqm"),
                    built_sar_sqm=d.get("built_sar_sqm"),
                    tier=d.get("tier"), confidence=d.get("confidence"),
                    source=d.get("source"),
                ))
        for ind in doc.get("indicators", []):
            indicators.append(MarketIndicator(
                scope=region, key=ind["key"], label=ind["label"],
                value=str(ind.get("value")), period=ind.get("period"),
                confidence=ind.get("confidence"), source=ind.get("source"),
            ))
        sources.extend(doc.get("sources", []))
        gaps.extend(doc.get("gaps", []))
    return districts, indicators, sources, gaps

BIDDER_POOL = [f"م-{n}" for n in range(101, 121)]


def seed():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    db.create_all()

    for s in SETTINGS:
        db.session.add(Setting(**s))

    # --- geography and market indicators from the research pass -------------
    geo_districts, geo_indicators, geo_sources, geo_gaps = load_geo()
    for d in geo_districts:
        db.session.add(d)
    for m in geo_indicators:
        db.session.add(m)
    db.session.flush()

    users = {}
    for u in USERS:
        user = User(**u)
        db.session.add(user)
        users.setdefault(u["role"], user)
    db.session.flush()

    props = {}
    for (ref, title, atype, city, district, area, value, insp, cond, missing) in P:
        p = Property(
            ref=ref, title=title, asset_type=atype, city=city, district=district,
            asset_subtype=subtype_for(title),
            area_sqm=area, estimated_value=value,
            last_inspection=TODAY - timedelta(days=insp) if insp is not None else None,
            condition_note=cond,
            deed_number=None if "deed" in missing or atype == "منقولات"
            else f"{rng.randint(300, 799)}{rng.randint(100000000, 999999999)}",
            owner_agent_id=users["agent"].id,
        )
        db.session.add(p)
        db.session.flush()
        for doc_type, label, required in docs_for(atype, title):
            present = doc_type not in missing
            db.session.add(Document(
                property_id=p.id, doc_type=doc_type, label=label, required=required,
                present=present, uploaded_at=utcnow() if present else None))
        db.session.flush()
        readiness.recompute(p)
        props[ref] = p

    # --- place assets on the map -------------------------------------------
    # Coordinates are the district centroid nudged slightly, so several assets
    # in one district do not stack into a single unreadable pin. They are
    # approximate by construction and the UI says so.
    lookup = {(d.city, d.name): d for d in geo_districts}
    placed = 0
    for i, prop in enumerate(props.values()):
        d = lookup.get((prop.city, prop.district))
        if d and d.lat and d.lng:
            prop.lat = d.lat + ((i % 7) - 3) * 0.0016
            prop.lng = d.lng + ((i % 5) - 2) * 0.0016
            placed += 1

    threshold = 70
    deposit_cap = 0.05
    now = utcnow()

    # Pass 1 — create the closed auctions first, so the pricing engine has
    # comparables to work from when the open ones are priced.
    ordered = sorted(A, key=lambda spec: 0 if spec[2] == "closed" else 1)
    auctions = {}
    for (code, ref, status, mins, plat) in ordered:
        p = props[ref]
        pricing.apply(p)
        effective = status
        if status != "closed" and p.readiness_score < threshold:
            effective = "blocked"

        opening = p.price_low or round(p.estimated_value * 0.975, -3)
        a = Auction(
            code=code, property_id=p.id, platform=PLATFORMS[plat] if effective != "blocked" else "—",
            status=effective, opening_price=opening, current_price=opening,
            min_increment=max(1000, round(p.estimated_value * 0.002, -3)),
            deposit_amount=round(p.estimated_value * deposit_cap),
            announced_at=now - timedelta(days=6),
            starts_at=now - timedelta(hours=3) if status == "live" else now + timedelta(days=2),
            ends_at=now + timedelta(minutes=mins),
        )
        db.session.add(a)
        db.session.flush()
        auctions[code] = a

        if status in ("live", "closed"):
            _seed_bids(a, p, users, closed=status == "closed")
        db.session.flush()

    # Pass 2 — reprice every open asset now that the closed set exists.
    for ref, p in props.items():
        pricing.apply(p)
    db.session.flush()
    for (code, ref, status, mins, plat) in A:
        a = auctions[code]
        if status not in ("live", "closed") and props[ref].price_low and props[ref].estimated_value:
            a.opening_price = props[ref].price_low
            a.current_price = props[ref].price_low

    # Appraiser decisions already on record, so the demo opens with both states.
    for ref in ("AST-2185", "AST-2140", "AST-2266", "AST-2299", "AST-2288"):
        props[ref].price_status = "approved"
        props[ref].price_decided_by = users["appraiser"].id
        props[ref].price_decided_at = utcnow()
    props["AST-2247"].price_status = "overridden"
    props["AST-2247"].price_decided_by = users["appraiser"].id
    props["AST-2247"].price_decided_at = utcnow()
    props["AST-2247"].price_decision_reason = (
        "صيانة السقف تخصم من القيمة السوقية — خُفض النطاق 6% عن اقتراح النظام"
    )

    db.session.flush()

    # A pre-existing integrity alert on the closed flagship auction.
    closed = auctions["AUC-2026-0790"]
    db.session.add(FraudAlert(
        code="FA-101", auction_id=closed.id, pattern="shill_pair",
        title="نمط نجش محتمل — تكرار زوج مزايدين", severity="عالٍ",
        signals=[
            "زيادة متبادلة بين المزايدَين م-101 و م-104 في 7 جولات متتالية",
            "الزوج وحده يمثّل 58% من انتقالات المزايدة في المزاد",
            "انسحاب أحدهما فور بلوغ السعر 4,380,000 ر.س",
        ],
        note="مخرج النظام تنبيه للمشرف فقط — لا حظر آلي. حرمان شخص من المشاركة في مزاد قضائي "
             "يمس حقاً مالياً ويقع في نطاق الاستخدام عالي المخاطر بتصنيف مبادئ سدايا. "
             "وعند ثبوت النجش لا يبطل البيع تلقائياً — للمتضرر خيار طلب الفسخ عند الغبن الفاحش.",
        state="مفتوح"))

    for title, body, tone in [
        ("مزاد يقترب من الإغلاق", "AUC-2026-0821 يغلق خلال أقل من ربع ساعة", "warning"),
        ("تنبيه نزاهة مفتوح", "FA-101 على المزاد AUC-2026-0790 — بانتظار قرار المشرف", "warning"),
        ("أصل محجوب عن الطرح", "AST-2214 — صك الملكية وكروكي الموقع غير مرفوعين", "error"),
        ("أصل محجوب عن الطرح", "AST-2308 — تقرير المعاينة غير مرفوع", "error"),
        ("توصية سعر بانتظار الاعتماد", "AST-2201 — نطاق مقترح بانتظار مراجعة المُقيّم", "info"),
        ("ترسية جديدة", "AUC-2026-0790 — رسا على 4,380,000 ر.س", "success"),
    ]:
        db.session.add(Notification(title=title, body=body, tone=tone))

    # --- audit trail ---------------------------------------------------------
    audit.record("مزاد+ (النظام)", "system", "تهيئة قاعدة البيانات",
                 f"بذر {len(P)} أصلاً و{len(A)} مزاداً و{len(USERS)} مستخدمين")
    for ref, p in props.items():
        audit.record("مزاد+ (محرك الجاهزية)", "ai", "احتساب درجة الجاهزية",
                     f"{ref} — {p.readiness_score}/100"
                     + (" · حجب آلي عن الطرح" if p.readiness_score < threshold else ""),
                     entity=f"property:{ref}")
        if p.price_low:
            audit.record("مزاد+ (محرك التسعير)", "ai", "توصية سعر افتتاح",
                         f"{ref} — نطاق {p.price_low:,.0f}–{p.price_high:,.0f} ر.س · "
                         f"احتمالية ترسية {p.hammer_probability}%", entity=f"property:{ref}")
    for ref in ("AST-2185", "AST-2140", "AST-2266", "AST-2299", "AST-2288"):
        audit.record("منى القحطاني", "human", "اعتماد توصية السعر",
                     f"{ref} — اعتماد النطاق كما هو دون تعديل", entity=f"property:{ref}")
    audit.record("منى القحطاني", "human", "تعديل توصية السعر",
                 f"AST-2247 — السبب: {props['AST-2247'].price_decision_reason}",
                 entity="property:AST-2247")
    audit.record("مزاد+ (محرك النزاهة)", "ai", "تنبيه نمط مزايدة",
                 "FA-101 — نمط نجش محتمل في AUC-2026-0790 · أُحيل للمشرف",
                 entity="auction:AUC-2026-0790")
    for code in ("AUC-2026-0790", "AUC-2026-0762", "AUC-2026-0771"):
        a = auctions[code]
        audit.record("مزاد+ (النظام)", "system", "إغلاق مزاد",
                     f"{code} — سعر الترسية {a.current_price:,.0f} ر.س", entity=f"auction:{code}")

    # --- real published auctions from the research pass ----------------------
    collected = load_collected_auctions()
    n_real, seq = 0, 5000
    for rec in collected:
        seq += 1
        subtype = rec.get("subtype") or "أخرى"
        atype = rec.get("asset_type") or SUBTYPE_TYPE.get(subtype, "عقار")
        value = rec.get("estimated_value") or rec.get("opening_price") or rec.get("hammer_price")
        # No published number → the listing is still real and still shown, but it
        # carries no valuation, cannot be priced, and never enters the corpus.
        ref = f"AST-{seq}"
        p = Property(
            ref=ref, title=rec["title"][:160], asset_type=atype, asset_subtype=subtype,
            city=rec["city"], district=rec.get("district") or "—",
            area_sqm=rec.get("area_sqm"), estimated_value=float(value) if value else None,
            last_inspection=TODAY - timedelta(days=20),
            condition_note=(rec.get("notes") or "")[:200] or None,
            deed_number=None, owner_agent_id=users["agent"].id,
            lat=rec.get("lat"), lng=rec.get("lng"),
        )
        # place on the map: published coords > matched district > city centroid
        if not (p.lat and p.lng):
            dname = (rec.get("district") or "").replace("حي ", "").strip()
            d = lookup.get((rec["city"], dname)) or next(
                (v for (c, n), v in lookup.items() if c == rec["city"] and dname and (dname in n or n in dname)), None)
            if d and d.lat:
                p.lat = d.lat + ((seq % 7) - 3) * 0.0014; p.lng = d.lng + ((seq % 5) - 2) * 0.0014
            else:
                city_pts = [v for (c, _), v in lookup.items() if c == rec["city"] and v.lat]
                if not city_pts and rec["city"] in CITY_CENTERS:
                    clat, clng = CITY_CENTERS[rec["city"]]
                    p.lat = clat + ((seq % 9) - 4) * 0.004; p.lng = clng + ((seq % 7) - 3) * 0.004
                    p.condition_note = ((p.condition_note or "") + " · موقع تقريبي على مستوى المدينة (الحي غير منشور)")[:200]
                elif city_pts:
                    p.lat = sum(v.lat for v in city_pts) / len(city_pts) + ((seq % 9) - 4) * 0.004
                    p.lng = sum(v.lng for v in city_pts) / len(city_pts) + ((seq % 7) - 3) * 0.004
                    p.condition_note = ((p.condition_note or "") + " · موقع تقريبي على مستوى المدينة (الحي غير منشور)")[:200]
        db.session.add(p); db.session.flush()
        for doc_type, label, required in docs_for(atype, rec["title"]):
            db.session.add(Document(property_id=p.id, doc_type=doc_type, label=label,
                                    required=required, present=True, uploaded_at=utcnow()))
        db.session.flush()
        readiness.recompute(p)
        props[ref] = p

        status = rec.get("status") or "closed"
        ends = _iso_to_dt(rec.get("ends_at")) or (now + timedelta(days=7) if status != "closed" else now - timedelta(days=30))
        if status == "live" and ends <= now:
            status = "closed"
        a = Auction(
            code=f"AUC-R-{seq}", property_id=p.id, platform=rec.get("platform") or "إنفاذ",
            status=status,
            opening_price=rec.get("opening_price") or (round(float(value) * 0.975, -3) if value else None),
            current_price=rec.get("hammer_price") or rec.get("opening_price") or (float(value) if value else None),
            min_increment=max(1000, round(float(value) * 0.002, -3)) if value else 1000,
            deposit_amount=rec.get("deposit") or (round(float(value) * deposit_cap) if value else None),
            announced_at=now - timedelta(days=6),
            starts_at=_iso_to_dt(rec.get("starts_at")) or now - timedelta(days=1),
            ends_at=ends,
        )
        db.session.add(a); db.session.flush()
        A.append((a.code, ref, status, 0, 0))
        auctions[a.code] = a
        # provenance lives in the audit trail, not in a UI badge
        audit.record("مزاد+ (وكيل البحث)", "system", "إدراج مزاد منشور",
                     f"{ref} — {rec.get('source_name') or 'مصدر منشور'} · {rec.get('confidence','measured')} · {rec.get('source_url','')[:90]}",
                     entity=f"property:{ref}")
        n_real += 1
    if collected:
        print(f"  {n_real} مزاداً منشوراً أُدرج من {len(collected)} سجلاً مجموعاً")

    # --- city profiles (climate, elevation, character) -----------------------
    with open(os.path.join(DATA_DIR, "city_profiles.json"), encoding="utf-8") as fh:
        for row in json.load(fh):
            db.session.add(CityProfile(**row))

    # --- realistic approximate parcels, aligned to real streets --------------
    n_parcels, n_aligned = geo.attach_parcels(list(props.values()))

    # --- aerial imagery for every located asset ------------------------------
    # Real satellite captures around the recorded coordinates, at two scales.
    # They are labelled "aerial", never "photo": a demo asset has no
    # photographs, and pretending otherwise would be the one fake thing here.
    ESRI = ("https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export"
            "?bbox={w},{s},{e},{n}&bboxSR=4326&imageSR=3857&size=960,600&format=jpg&f=image")
    photo_count = 0
    for prop in props.values():
        if not (prop.lat and prop.lng):
            continue
        side = (prop.area_sqm or 900) ** 0.5
        for j, (factor, cap) in enumerate(((6.0, "صورة جوية — المحيط"), (2.2, "صورة جوية — الموقع عن قرب"))):
            half_m = max(90, side * factor / 2)
            dlat = half_m / 111_320
            dlng = half_m / (111_320 * math.cos(math.radians(prop.lat)))
            url = ESRI.format(w=prop.lng - dlng * 1.6, s=prop.lat - dlat, e=prop.lng + dlng * 1.6, n=prop.lat + dlat)
            db.session.add(PropertyPhoto(property_id=prop.id, kind="aerial", url=url, caption=cap, sort=j))
            photo_count += 1

    # --- persist the register snapshot for every asset ----------------------
    # The disclosure endpoint recomputes this live, but persisting it here gives
    # the property page something to show without a round trip, and gives the
    # closing report stored rows with their own fetched_at.
    enc_count = 0
    for prop in props.values():
        results = registry.query_all(prop)
        najiz = (results["najiz"].get("data") or {})
        ejar = (results["ejar"].get("data") or {})
        enf = (results["enforcement"].get("data") or {})
        qeema = (results["qeema"].get("data") or {})

        mortgage = najiz.get("mortgage") or {}
        if mortgage.get("present"):
            db.session.add(Encumbrance(
                property_id=prop.id, kind="mortgage", status="active",
                held_by_executing_creditor=mortgage.get("heldByExecutingCreditor"),
                amount=mortgage.get("amount"), source_key="najiz",
                detail="رهن مسجّل في السجل العيني"))
            enc_count += 1
        if (najiz.get("seizure") or {}).get("present"):
            db.session.add(Encumbrance(property_id=prop.id, kind="seizure",
                                       status="active", source_key="najiz",
                                       detail="حجز مسجّل على الأصل"))
            enc_count += 1

        lease = ejar.get("lease") or {}
        if lease.get("present") and lease.get("endsOn"):
            db.session.add(Encumbrance(
                property_id=prop.id, kind="lease", status="active",
                lease_end=date.fromisoformat(lease["endsOn"]), source_key="ejar",
                detail=f"عقد إيجار موثّق — {lease.get('monthsRemaining')} شهراً متبقية"))
            enc_count += 1

        objection = enf.get("objection") or {}
        if objection.get("present"):
            db.session.add(Encumbrance(property_id=prop.id, kind="dispute",
                                       status="active", source_key="enforcement",
                                       detail=objection.get("detail")))
            enc_count += 1

        report = qeema.get("report") or {}
        if report.get("present"):
            db.session.add(Encumbrance(
                property_id=prop.id, kind="valuation", status="active",
                valuation_date=date.fromisoformat(report["valuationDate"]),
                valuer_licence=report.get("valuerLicence"), source_key="qeema",
                detail=f"تقييم بمنهجية {report.get('method')}"))
            enc_count += 1

    audit.record("مزاد+ (طبقة الموصّلات)", "system", "لقطة السجلات الرسمية",
                 f"{enc_count} قيداً من أربعة سجلات — وضع محاكاة، الربط الحقيقي مطلوب من إنفاذ")

    db.session.commit()

    live = len([x for x in A if x[2] == "live"])
    closed_n = len([x for x in A if x[2] == "closed"])
    blocked_n = len([p for p in props.values() if p.readiness_score < threshold])
    print(f"✔ تم إنشاء قاعدة البيانات: {DB_PATH}")
    print(f"  {len(USERS)} مستخدمين · {len(P)} أصلاً · {len(A)} مزاداً "
          f"({live} جارٍ، {closed_n} منتهٍ، {blocked_n} أصل محجوب)")
    print(f"  {Bid.query.count()} مزايدة · {enc_count} قيداً من السجلات الرسمية · {photo_count} صورة جوية")
    print(f"  {len(geo_districts)} حياً في {len({d.city for d in geo_districts})} مدن · "
          f"{placed} أصلاً مُثبتاً على الخريطة ({n_aligned}/{n_parcels} قطعة محاذاة لشارع OSM) · {len(geo_indicators)} مؤشراً · "
          f"{len(geo_gaps)} فجوة بيانية معلنة")
    print("\n  هويات الدخول التجريبية:")
    for u in USERS:
        print(f"    {u['national_id']}  —  {u['full_name']} ({u['role_label']})")


def _seed_bids(auction, prop, users, closed=False):
    """Build a plausible bid history, including the pattern the detector finds."""
    base = auction.opening_price or prop.estimated_value
    ends = auction.ends_at
    start = ends - timedelta(hours=3)

    if auction.code == "AUC-2026-0790":
        # A deliberate two-party alternation, so the shill detector has a real
        # signal to find rather than a hard-coded alert.
        aliases = ["م-101", "م-104"]
        amount = base
        for i in range(16):
            amount += round(base * 0.006, -3)
            db.session.add(Bid(
                auction_id=auction.id, bidder_alias=aliases[i % 2], amount=amount,
                ip_hash="shared-a", created_at=start + timedelta(minutes=i * 8)))
        auction.current_price = amount
        auction.winner_user_id = users["bidder"].id
        return

    pool = rng.sample(BIDDER_POOL, rng.randint(4, 8))
    amount = base
    count = rng.randint(8, 22)
    for i in range(count):
        amount += round(base * rng.uniform(0.003, 0.011), -3)
        db.session.add(Bid(
            auction_id=auction.id, bidder_alias=rng.choice(pool), amount=amount,
            ip_hash=f"net-{rng.randint(0, 6)}",
            created_at=start + timedelta(minutes=int(i * (170 / max(count, 1))))))
    auction.current_price = amount
    if closed:
        auction.winner_user_id = users["bidder"].id
        db.session.add(Payment(
            auction_id=auction.id, user_id=users["bidder"].id, amount=amount,
            kind="settlement", status="settled", settled_at=utcnow()))


if __name__ == "__main__":
    with app.app_context():
        seed()
