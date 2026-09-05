import { useEffect, useState } from "react";

import { api } from "../api";
import { Alert, Button, Card, Icon, icons, Loading, num, Tag } from "../components/ui";
import AerialPhoto from "../components/AerialPhoto";

/**
 * المتشابهات — like-for-like comparison across cities, with the reasoning shown.
 *
 * A comparison table without a "why" column just ranks by price. This one
 * carries the base asset in the first column and explains every feature it
 * compares on, so the buyer can weigh a colder city against a cheaper metre.
 */
const CLIMATE_TONE = { "بارد": "info", "معتدل": "success", "حار": "warning" };

export default function Compare({ refCode, go }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(new Set());

  useEffect(() => { api.similar(refCode).then(setData).catch((e) => setError(e.message)); }, [refCode]);
  if (error) return <Alert tone="error" title="تعذّر جلب المتشابهات">{error}</Alert>;
  if (!data) return <Loading label="جارٍ البحث عن المتشابهات عبر المدن…" />;

  const base = data.rows.find((r) => r.isBase);
  const others = data.rows.filter((r) => !r.isBase);
  const cities = [...new Set(others.map((r) => r.city))];
  const shown = [base, ...others.filter((r) => picked.size === 0 || picked.has(r.city))].filter(Boolean);
  const toggle = (c) => setPicked((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const dev = (r) => r.deviationPct === null ? <span style={{ color: "var(--text-tertiary)" }}>—</span>
    : <Tag tone={r.deviationPct < -15 ? "success" : r.deviationPct > 10 ? "error" : "neutral"}>{r.deviationPct > 0 ? "+" : ""}{r.deviationPct}%</Tag>;

  return (
    <div className="stack">
      <div className="breadcrumb">
        <button onClick={() => go("property", refCode)}>{refCode}</button><span>/</span><span>المتشابهات</span>
      </div>
      <div className="pagehead">
        <div>
          <h1>المتشابهات — مقارنة عبر المدن</h1>
          <p className="pagehead__sub">
            نفس الفئة «{data.criteria.subtype}»
            {data.criteria.areaRange && ` · مساحة ${num(data.criteria.areaRange[0])}–${num(data.criteria.areaRange[1])} م²`}
            {` · قيمة ${num(data.criteria.valueRange[0])}–${num(data.criteria.valueRange[1])} ر.س`}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => go("property", refCode)}><Icon path={icons.back} size={14} /> رجوع</Button>
      </div>

      {others.length === 0 ? (
        <Alert tone="info">لا توجد أصول مشابهة ضمن نطاق المساحة والقيمة في المنصة حالياً.</Alert>
      ) : (
        <>
          <div className="row row--wrap" style={{ gap: "var(--dga-space-md)" }}>
            <span className="stat__label">المدن:</span>
            {cities.map((c) => (
              <Button key={c} size="sm" variant={picked.size === 0 || picked.has(c) ? "primary" : "secondary"} onClick={() => toggle(c)}>{c}</Button>
            ))}
            {picked.size > 0 && <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>الكل</Button>}
          </div>

          <Card>
            <div className="table-scroll">
              <table className="table cmp">
                <thead>
                  <tr>
                    <th>الميزة</th>
                    {shown.map((r) => (
                      <th key={r.ref} className={r.isBase ? "cmp__base" : ""}>
                        <div className="cmp__head">
                          <AerialPhoto lat={r.lat} lng={r.lng} areaSqm={r.areaSqm} seed={r.ref} height={70} caption={false} />
                          <b>{r.title}</b>
                          <span>{r.city} · {r.district}{r.isBase && " · الأصل الحالي"}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr><td><strong>السعر الحالي</strong></td>{shown.map((r) => <td key={r.ref} className={`tnum ${r.isBase ? "cmp__base" : ""}`}>{r.price ? num(r.price) + " ر.س" : "—"}</td>)}</tr>
                  <tr><td><strong>المساحة</strong></td>{shown.map((r) => <td key={r.ref} className={`tnum ${r.isBase ? "cmp__base" : ""}`}>{r.areaSqm ? num(r.areaSqm) + " م²" : "—"}</td>)}</tr>
                  <tr><td><strong>ر.س/م²</strong></td>{shown.map((r) => <td key={r.ref} className={`tnum ${r.isBase ? "cmp__base" : ""}`}>{r.pricePerSqm ? num(r.pricePerSqm) : "—"}</td>)}</tr>
                  <tr><td><strong>وسيط الحي</strong></td>{shown.map((r) => <td key={r.ref} className={`tnum ${r.isBase ? "cmp__base" : ""}`}>{r.districtBenchmark ? num(r.districtBenchmark) : "—"}</td>)}</tr>
                  <tr><td><strong>الانحراف عن الوسيط</strong></td>{shown.map((r) => <td key={r.ref} className={r.isBase ? "cmp__base" : ""}>{dev(r)}</td>)}</tr>
                  <tr><td><strong>المناخ والارتفاع</strong></td>{shown.map((r) => <td key={r.ref} className={r.isBase ? "cmp__base" : ""}>{r.climate ? <><Tag tone={CLIMATE_TONE[r.climate]}>{r.climate}</Tag> <span className="tnum" style={{ fontSize: "var(--dga-font-size-xs)" }}>{r.elevationM} م · صيف {r.summerHighC}°</span></> : "—"}</td>)}</tr>
                  <tr><td><strong>طابع المدينة</strong></td>{shown.map((r) => <td key={r.ref} className={r.isBase ? "cmp__base" : ""}>{(r.character || []).join(" · ") || "—"}</td>)}</tr>
                  <tr><td><strong>الجاهزية</strong></td>{shown.map((r) => <td key={r.ref} className={`tnum ${r.isBase ? "cmp__base" : ""}`}>{r.readiness}/100</td>)}</tr>
                  <tr><td><strong>القيود</strong></td>{shown.map((r) => <td key={r.ref} className={r.isBase ? "cmp__base" : ""}>{r.redFlags ? <Tag tone="error">⛔ {r.redFlags}</Tag> : null} {r.amberFlags ? <Tag tone="warning">⚠ {r.amberFlags}</Tag> : null}{!r.redFlags && !r.amberFlags && <Tag tone="success">لا قيود</Tag>}</td>)}</tr>
                  <tr><td><strong>الحالة</strong></td>{shown.map((r) => <td key={r.ref} className={r.isBase ? "cmp__base" : ""}>{r.status || "—"}</td>)}</tr>
                  <tr><td /><td colSpan={shown.length}>
                    <div className="row row--wrap" style={{ gap: "var(--dga-space-md)" }}>
                      {shown.map((r) => (
                        <span key={r.ref} className="row" style={{ gap: 4 }}>
                          <Button size="sm" variant="ghost" onClick={() => go("disclosure", r.ref)}>كشف {r.ref}</Button>
                          {r.auctionCode && <Button size="sm" variant="ghost" onClick={() => go("auction", r.auctionCode)}>المزاد</Button>}
                        </span>
                      ))}
                    </div>
                  </td></tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card>
        <div className="card__head"><h3>ماذا تعني كل ميزة</h3></div>
        <div className="card__body">
          <dl className="kv">
            {data.features.map((f) => (<><dt key={f.key + "t"}>{f.label}</dt><dd key={f.key + "d"} style={{ fontWeight: 400, textAlign: "right" }}>{f.why}</dd></>))}
          </dl>
        </div>
      </Card>
    </div>
  );
}
