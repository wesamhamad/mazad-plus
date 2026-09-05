import { useState } from "react";

import { api } from "../api";
import { Alert, Button, Card, Field, Icon, icons, num, sar, Tag } from "../components/ui";

/** استعلام بالصك / السجل العيني — the entry point of the pre-bid disclosure. */
export default function Inquiry({ go }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState(null);

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(""); setRes(null);
    try { setRes(await api.inquiry(q)); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  const s = res?.disclosure?.summary;

  return (
    <div className="stack">
      <div className="pagehead">
        <div><h1>استعلام بالصك أو السجل العيني</h1>
          <p className="pagehead__sub">رهن · حجز · عقد إيجار · نزاع — قبل دفع العربون</p></div>
      </div>
      <Card>
        <form className="card__body stack" onSubmit={submit}>
          <Field label="رقم الصك الإلكتروني (12 رقماً) · أو الهوية العقارية · أو مرجع الأصل AST-…" htmlFor="inq" error={err}>
            <input id="inq" className={`input nfx__idinput${err ? " input--error" : ""}`} style={{ letterSpacing: 2 }} value={q}
                   placeholder="مثال: 310204008812" onChange={(e) => { setQ(e.target.value); setErr(""); }} />
          </Field>
          <Button type="submit" size="lg" disabled={!q.trim() || busy}>{busy ? "جارٍ الاستعلام…" : "استعلام"}</Button>
        </form>
      </Card>

      {res && !res.found && (
        <Alert tone="warning" title="لا تطابق في سجلات مزاد+">{res.message}</Alert>
      )}
      {res && res.found && (
        <Card>
          <div className="card__head">
            <h3>{res.property.title}</h3>
            <Tag tone={s.tone}>{s.verdict}</Tag>
          </div>
          <div className="card__body stack stack--sm">
            <dl className="kv">
              <dt>المرجع</dt><dd className="tnum">{res.property.ref}</dd>
              <dt>رقم الصك</dt><dd className="tnum">{res.property.deedNumber || "—"}</dd>
              <dt>المدينة</dt><dd>{res.property.city} · {res.property.district}</dd>
              <dt>القيمة التقديرية</dt><dd className="tnum">{sar(res.property.estimatedValue)}</dd>
              <dt>الأعلام</dt><dd><Tag tone="error">⛔ {s.red}</Tag> <Tag tone="warning">⚠ {s.amber}</Tag></dd>
            </dl>
            <div className="row row--wrap" style={{ gap: "var(--dga-space-md)" }}>
              <Button onClick={() => go("disclosure", res.property.ref)}><Icon path={icons.shield} size={14} /> كشف الأصل الكامل</Button>
              <Button variant="secondary" onClick={() => go("compare", res.property.ref)}>المتشابهات</Button>
              {res.auctionCode && <Button variant="secondary" onClick={() => go("auction", res.auctionCode)}>المزاد</Button>}
            </div>
          </div>
        </Card>
      )}

      {res && (
        <Card>
          <div className="card__head"><h3>الاستعلام الرسمي — البورصة العقارية</h3><Tag tone="neutral">وزارة العدل</Tag></div>
          <div className="card__body stack stack--sm">
            <p style={{ fontSize: "var(--dga-font-size-sm)", lineHeight: 1.8 }}>{res.official.note}</p>
            <a className="btn btn--secondary" href={res.official.portal} target="_blank" rel="noreferrer" style={{ alignSelf: "flex-start", textDecoration: "none" }}>
              <Icon path={icons.link} size={14} /> افتح البورصة العقارية srem.moj.gov.sa
            </a>
          </div>
        </Card>
      )}

      <Alert tone="info" title="ما الذي يعمل فعلاً هنا">
        التحقق من صيغة الرقم، والمطابقة مع أصول المنصة، وتشغيل السجلات الأربعة (محاكاة) على الأصل
        المطابق. الربط الحقيقي بالسجل العيني يتطلب اتفاقية — والمسار العملي المكتشف هو «واثق»
        (developer.wathq.sa) بباقة تجريبية مجانية. انظر <button className="auth__link" onClick={() => go("registry")}>سجل التكامل</button>.
      </Alert>
    </div>
  );
}
