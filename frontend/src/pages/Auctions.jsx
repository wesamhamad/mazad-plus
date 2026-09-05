import { useEffect, useState } from "react";

import { api } from "../api";
import {
  Alert, AUCTION_STATUS, Button, Card, Countdown, Loading, num, sar, Tag,
} from "../components/ui";
import AerialPhoto from "../components/AerialPhoto";

const FILTERS = [
  ["all", "الكل"],
  ["live", "جارية"],
  ["upcoming", "قادمة"],
  ["blocked", "محجوبة"],
  ["closed", "منتهية"],
];

function AuctionCard({ auction, onOpen }) {
  const status = AUCTION_STATUS[auction.status] || AUCTION_STATUS.draft;
  const p = auction.property;
  const stripClass =
    auction.status === "live"
      ? "auction__strip"
      : auction.status === "upcoming"
      ? "auction__strip auction__strip--upcoming"
      : "auction__strip auction__strip--muted";

  return (
    <Card className="auction">
      <div className={stripClass} />
      <AerialPhoto lat={p.lat} lng={p.lng} areaSqm={p.areaSqm} seed={p.ref} height={150} className="auction__photo" />
      <div className="auction__body">
        <div className="row row--between" style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div className="auction__code">{auction.code}</div>
            <h3 className="auction__title">{p.title}</h3>
          </div>
          <Tag tone={status.tone} dot={auction.status === "live"}>
            {status.label}
          </Tag>
        </div>

        <div className="auction__meta">
          <span>{p.city}</span>
          <span>·</span>
          <span>{p.assetType}</span>
          {auction.platform && auction.platform !== "—" && (
            <>
              <span>·</span>
              <span>منصة {auction.platform}</span>
            </>
          )}
        </div>

        {auction.status === "blocked" ? (
          <Alert tone="error" title="محجوب عن الطرح آلياً">
            درجة الجاهزية {p.readinessScore}/100 — دون الحد المسموح
          </Alert>
        ) : (
          <div>
            <div className="stat__label">
              {auction.status === "live"
                ? "أعلى مزايدة حالية"
                : auction.status === "closed"
                ? "سعر الترسية"
                : "سعر الافتتاح"}
            </div>
            <div className="auction__price">{sar(auction.currentPrice || auction.openingPrice)}</div>
            <div className="auction__code">القيمة التقديرية {num(p.estimatedValue)} ر.س</div>
          </div>
        )}

        {auction.status === "live" && (
          <div className="auction__meta">
            <span>
              <b className="tnum">{auction.bidderCount}</b> مزايد
            </span>
            <span>·</span>
            <span>
              <b className="tnum">{auction.bidCount}</b> مزايدة
            </span>
          </div>
        )}

        <div className="auction__foot">
          {auction.status === "live" || auction.status === "upcoming" ? (
            <Countdown endsAt={auction.endsAt} />
          ) : (
            <Tag tone="neutral">
              {auction.status === "closed" ? "انتهى المزاد" : "بانتظار استكمال المستندات"}
            </Tag>
          )}
          <Button size="sm" variant="secondary" onClick={onOpen}>
            التفاصيل
          </Button>
        </div>
      </div>
    </Card>
  );
}

const PAGE = 36;

export default function Auctions({ go }) {
  const [filter, setFilter] = useState("all");
  const [city, setCity] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setData(null);
    const load = () =>
      api.auctions(filter)
        .then((d) => alive && setData(d))
        .catch((e) => alive && setError(e.message));
    load();
    const id = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [filter]);

  if (error) return <Alert tone="error" title="تعذّر تحميل المزادات">{error}</Alert>;

  const cities = data ? [...new Set(data.auctions.map((a) => a.property.city))].sort() : [];
  const filtered = data ? data.auctions.filter((a) =>
    (city === "all" || a.property.city === city) &&
    (!q || (a.property.title + " " + (a.property.district || "") + " " + a.code).includes(q))
  ) : [];
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageItems = filtered.slice(Math.min(page, pages - 1) * PAGE, Math.min(page, pages - 1) * PAGE + PAGE);

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>المزادات</h1>
          <p className="pagehead__sub">جميع المزادات عبر المنصات المعتمدة لدى إنفاذ</p>
        </div>
      </div>

      <div className="row row--wrap" style={{ gap: "var(--dga-space-md)" }}>
        {FILTERS.map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? "primary" : "secondary"}
            onClick={() => setFilter(key)}
          >
            {label}
            {data?.counts?.[key] != null && (
              <span className="tnum" style={{ opacity: 0.75 }}>
                {data.counts[key]}
              </span>
            )}
          </Button>
        ))}
      </div>

      {data && (
        <div className="row row--wrap" style={{ gap: "var(--dga-space-md)" }}>
          <select className="input" style={{ width: "auto" }} value={city} onChange={(e) => { setCity(e.target.value); setPage(0); }}>
            <option value="all">كل المدن ({data.auctions.length})</option>
            {cities.map((c) => <option key={c} value={c}>{c} ({data.auctions.filter((a) => a.property.city === c).length})</option>)}
          </select>
          <input className="input" style={{ width: 260 }} placeholder="بحث بالعنوان أو الحي أو الرقم" value={q}
                 onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          <span className="stat__label"><span className="tnum">{filtered.length}</span> نتيجة</span>
        </div>
      )}

      {!data ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Card>
          <div className="empty">لا توجد مزادات مطابقة</div>
        </Card>
      ) : (
        <>
          <div className="grid grid--cards">
            {pageItems.map((a) => (
              <AuctionCard key={a.code} auction={a} onOpen={() => go("auction", a.code)} />
            ))}
          </div>
          {pages > 1 && (
            <div className="row" style={{ justifyContent: "center", gap: "var(--dga-space-md)" }}>
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => { setPage(page - 1); window.scrollTo({ top: 0 }); }}>السابق</Button>
              <span className="tnum stat__label">صفحة {Math.min(page, pages - 1) + 1} من {pages}</span>
              <Button size="sm" variant="secondary" disabled={page >= pages - 1} onClick={() => { setPage(page + 1); window.scrollTo({ top: 0 }); }}>التالي</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
