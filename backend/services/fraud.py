"""رصد أنماط المزايدة المشبوهة — bid-pattern anomaly detection.

Najsh (النجش) — bidding with no intent to buy, in order to pull the price up —
is prohibited by an explicit prophetic prohibition, and collusion in tenders
and auctions is prohibited by the Competition Law. So this module is the
automation of an existing duty, not a commercial add-on.

Two rules govern the output and are enforced here in code, not just in the UI:

  1. Every detection produces an ALERT for a human supervisor. Nothing in this
     module blocks, bans, or cancels. Automatically excluding a person from a
     judicial auction touches a financial right and is a high-risk use under
     SDAIA's AI principles, which mandates human review.
  2. IP and device signals are scored as ONE signal among several and are
     labelled as such. Saudi carriers put thousands of subscribers behind a
     single address, a household shares one router, and a serious manipulator
     uses a VPN anyway — so a shared address is a reason to look, never proof.
"""
from collections import Counter
from datetime import timedelta

from models import as_utc

SNIPE_WINDOW_SECONDS = 10
MIN_PAIR_ALTERNATIONS = 5
WITHDRAWAL_WINDOW_SECONDS = 60


def _severity(signal_count, strong):
    if strong and signal_count >= 3:
        return "عالٍ"
    if signal_count >= 2:
        return "متوسط"
    return "منخفض"


def detect_shill_pair(auction):
    """Repeated two-party alternation — the classic price-pumping pattern."""
    bids = sorted(auction.bids, key=lambda b: as_utc(b.created_at))
    if len(bids) < MIN_PAIR_ALTERNATIONS * 2:
        return None

    alternations = Counter()
    for a, b in zip(bids, bids[1:]):
        if a.bidder_alias != b.bidder_alias:
            alternations[frozenset((a.bidder_alias, b.bidder_alias))] += 1

    if not alternations:
        return None
    pair, count = alternations.most_common(1)[0]
    if count < MIN_PAIR_ALTERNATIONS:
        return None

    names = " و".join(sorted(pair))
    signals = [f"زيادة متبادلة بين المزايدَين {names} في {count} جولات متتالية"]

    share = count / max(1, len(bids) - 1)
    if share > 0.5:
        signals.append(f"الزوج وحده يمثّل {share:.0%} من انتقالات المزايدة في المزاد")

    ip_hashes = {b.ip_hash for b in bids if b.bidder_alias in pair and b.ip_hash}
    if len(ip_hashes) == 1:
        signals.append("تطابق بصمة الشبكة بين طرفي الزوج — إشارة خطر واحدة، وليست دليلاً")

    return {
        "pattern": "shill_pair",
        "title": "نمط نجش محتمل — تكرار زوج مزايدين",
        "severity": _severity(len(signals), strong=share > 0.5),
        "signals": signals,
        "note": (
            "مخرج النظام تنبيه للمشرف فقط — لا حظر آلي. حرمان شخص من المشاركة في مزاد قضائي "
            "يمس حقاً مالياً ويقع في نطاق الاستخدام عالي المخاطر بتصنيف مبادئ سدايا، "
            "ويستوجب مراجعة بشرية. وعند ثبوت النجش لا يبطل البيع تلقائياً — للمتضرر خيار "
            "طلب الفسخ عند الغبن الفاحش، وهو مسار يُفتح بقرار بشري."
        ),
    }


def detect_late_sniping(auction):
    """Bids landing inside the closing window, weighted by network overlap."""
    if not auction.ends_at:
        return None
    ends = as_utc(auction.ends_at)
    cutoff = ends - timedelta(seconds=SNIPE_WINDOW_SECONDS)
    late = [b for b in auction.bids if as_utc(b.created_at) >= cutoff]
    if not late:
        return None

    signals = []
    for b in late[:3]:
        delta = (ends - as_utc(b.created_at)).total_seconds()
        signals.append(f"مزايدة من {b.bidder_alias} قبل {int(delta)} ثانية من الإغلاق")

    ip_counts = Counter(b.ip_hash for b in auction.bids if b.ip_hash)
    shared = [b for b in late if b.ip_hash and ip_counts[b.ip_hash] > 1]
    if shared:
        signals.append(
            "مشاركة بصمة شبكة مع مزايد آخر في المزاد نفسه — إشارة ضمن نموذج متعدد الإشارات"
        )

    return {
        "pattern": "late_sniping",
        "title": "قنص متأخر في نافذة الإغلاق",
        "severity": _severity(len(signals), strong=bool(shared) and len(late) > 1),
        "signals": signals,
        "note": (
            "عنوان الإنترنت وبصمة المتصفح بيانات شخصية بمقتضى التعريف الواسع في نظام حماية "
            "البيانات الشخصية — تحتاج إفصاحاً في سياسة الخصوصية وأساساً نظامياً ومدة احتفاظ "
            "محددة. وتُستخدم هنا كإشارة خطر لا كدليل: المشغّلون يضعون آلاف المشتركين خلف "
            "عنوان واحد."
        ),
    }


def detect_coordinated_withdrawal(auction):
    """Several bidders going quiet together right after a price threshold."""
    bids = sorted(auction.bids, key=lambda b: as_utc(b.created_at))
    if len(bids) < 6:
        return None

    last_seen = {}
    for b in bids:
        last_seen[b.bidder_alias] = as_utc(b.created_at)

    final_ts = as_utc(bids[-1].created_at)
    leavers = [
        alias for alias, ts in last_seen.items()
        if alias != bids[-1].bidder_alias
        and (final_ts - ts).total_seconds() <= WITHDRAWAL_WINDOW_SECONDS
    ]
    if len(leavers) < 3:
        return None

    threshold = bids[-1].amount
    return {
        "pattern": "coordinated_withdrawal",
        "title": "انسحاب منسّق محتمل",
        "severity": "متوسط",
        "signals": [
            f"توقّف {len(leavers)} مزايدين عن المزايدة خلال {WITHDRAWAL_WINDOW_SECONDS} ثانية",
            f"التوقّف تزامن مع بلوغ السعر {threshold:,.0f} ر.س",
        ],
        "note": (
            "التواطؤ في المزايدات محظور بنص نظام المنافسة. عند ثبوته يُفتح مسار إحالة "
            "للهيئة العامة للمنافسة — بقرار من المشرف، لا آلياً."
        ),
    }


DETECTORS = (detect_shill_pair, detect_late_sniping, detect_coordinated_withdrawal)


def scan(auction):
    """Run every detector over one auction and return the raw findings."""
    findings = []
    for detector in DETECTORS:
        result = detector(auction)
        if result:
            findings.append(result)
    return findings
