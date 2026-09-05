import { useEffect, useState } from "react";

import { api } from "../api";
import { Alert, Button, Card, Icon, icons, Loading, num, sar, Tag } from "../components/ui";

/** قائمة التقارير — the issued, sealed documents. */
export function ReportsList({ go }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.reports().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert tone="error" title="تعذّر تحميل التقارير">{error}</Alert>;
  if (!data) return <Loading />;

  const { reports, pricing } = data;
  const revenue = reports.reduce((s, r) => s + (r.priceSar || 0), 0);

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>التقارير المختومة</h1>
          <p className="pagehead__sub">
            كشوف الأصول وتقارير الإقفال — منتج معلوماتي يُباع بالنسخة، لا نسبة من الصفقة
          </p>
        </div>
        <Tag tone="neutral">
          إيراد التقارير <span className="tnum">{num(revenue)}</span> ر.س
        </Tag>
      </div>

      <Alert tone="info" title="لماذا التقارير هي نموذج الإيراد وليست النسبة">
        تعريف الوساطة العقارية مقيّد بعنصرين: التوسط في إتمام الصفقة، ومقابل عمولة. رسم ثابت
        لكل تقرير لا يستحضر ركن العمولة، والنسبة من قيمة الصفقة تستحضره مباشرة وتنقل المنصة إلى
        دائرة الترخيص الإلزامي. لذلك التسعير هنا بالنسخة:{" "}
        <b>كشف أصل {pricing.disclosure} ر.س</b> · <b>تقرير إقفال {pricing.closing} ر.س</b> —
        زائد ضريبة القيمة المضافة {(pricing.vatRate * 100).toFixed(0)}%.
      </Alert>

      <Card>
        {reports.length === 0 ? (
          <div className="empty">
            لم يصدر أي تقرير بعد — أصدر كشفاً من صفحة أي أصل، أو تقرير إقفال من مزاد منتهٍ
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th>الرقم</th><th>النوع</th><th>الأصل</th><th>المزاد</th><th>البصمة</th><th>الرسم</th><th /></tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.code}>
                    <td><strong className="tnum">{r.code}</strong></td>
                    <td>
                      <Tag tone={r.kind === "closing" ? "primary" : "info"}>
                        {r.kind === "closing" ? "تقرير إقفال" : "كشف أصل"}
                      </Tag>
                    </td>
                    <td className="tnum">{r.propertyRef}</td>
                    <td className="tnum">{r.auctionCode || "—"}</td>
                    <td className="tnum" style={{ fontSize: "var(--dga-font-size-2xs)" }}>
                      {r.contentHash.slice(0, 14)}…
                    </td>
                    <td className="tnum">{num(r.priceSar)} ر.س</td>
                    <td>
                      <Button size="sm" variant="ghost" onClick={() => go("report", r.code)}>فتح</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/** تقرير واحد — the sealed document itself. */
export function ReportView({ code, go }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.report(code).then(setData).catch((e) => setError(e.message));
  }, [code]);

  if (error) return <Alert tone="error" title="تعذّر فتح التقرير">{error}</Alert>;
  if (!data) return <Loading />;

  const { report, integrity, invoice } = data;
  const p = report.payload;
  const facts = p.auctionFacts;
  const curve = facts?.priceCurve || [];

  return (
    <div className="stack">
      <div className="breadcrumb">
        <button onClick={() => go("reports")}>التقارير</button>
        <span>/</span>
        <span className="tnum">{report.code}</span>
      </div>

      <div className="pagehead">
        <div>
          <h1>{p.kind === "closing" ? "تقرير إقفال مزاد" : "كشف أصل"}</h1>
          <p className="pagehead__sub">
            {p.asset.title} · صدر في{" "}
            <span className="tnum">
              {new Date(report.sealedAt).toLocaleString("en-GB", { hour12: false })}
            </span>
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => window.print()}>
          طباعة / حفظ PDF
        </Button>
      </div>

      {/* ------------------------------------------------------------- seal */}
      <div className={`rpt__seal${integrity.valid ? "" : " rpt__seal--broken"}`}>
        <Icon path={integrity.valid ? icons.check : icons.alert} size={26} strokeWidth={2.2} />
        <div style={{ minWidth: 0 }}>
          <b>{integrity.valid ? "الختم سليم — لم يُعدَّل التقرير بعد إصداره" : "الختم مكسور"}</b>
          <div className="rpt__hash">SHA-256 · {report.contentHash}</div>
        </div>
      </div>

      <Card>
        {/* أ) هوية الأصل */}
        <div className="rpt__section">
          <h4>أ) هوية الأصل</h4>
          <dl className="kv">
            <dt>المرجع</dt><dd className="tnum">{p.asset.ref}</dd>
            <dt>الوصف</dt><dd>{p.asset.title}</dd>
            <dt>النوع</dt><dd>{p.asset.subtype}</dd>
            <dt>المدينة / الحي</dt><dd>{p.asset.city} · {p.asset.district}</dd>
            {p.asset.areaSqm && (<><dt>المساحة</dt><dd className="tnum">{num(p.asset.areaSqm)} م²</dd></>)}
            <dt>رقم الصك</dt><dd className="tnum">{p.asset.deedNumber || "—"}</dd>
            <dt>القيمة التقديرية</dt><dd className="tnum">{sar(p.asset.estimatedValue)}</dd>
          </dl>
        </div>

        {/* ب) الوضع النظامي */}
        <div className="rpt__section">
          <h4>ب) الوضع النظامي عند الطرح</h4>
          {p.flags.length === 0 ? (
            <p style={{ fontSize: "var(--dga-font-size-sm)", color: "var(--text-secondary)" }}>
              لم تُرصد قيود في السجلات الأربعة وقت الإصدار.
            </p>
          ) : (
            <div className="stack" style={{ gap: "var(--dga-space-md)" }}>
              {p.flags.map((f) => (
                <div className="comparable" key={f.code}>
                  <span>{f.level === "red" ? "⛔" : "⚠"} {f.title}</span>
                  <span style={{ color: "var(--text-tertiary)", fontSize: "var(--dga-font-size-2xs)" }}>
                    {f.source}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="note" style={{ marginTop: "var(--dga-space-lg)" }}>
            كل بند أعلاه مقروء من سجله وقت الإصدار، ومثبَّت بتاريخ السحب داخل الحمولة المختومة.
          </p>
        </div>

        {/* ج) أساس التقييم */}
        {p.valuationBasis && (
          <div className="rpt__section">
            <h4>ج) أساس التقييم</h4>
            <dl className="kv">
              <dt>تاريخ التقييم</dt><dd className="tnum">{p.valuationBasis.valuationDate}</dd>
              <dt>رخصة المقيّم</dt><dd className="tnum">{p.valuationBasis.valuerLicence}</dd>
              <dt>المنهجية</dt><dd>{p.valuationBasis.method}</dd>
              <dt>تحفّظ البيع المستعجل</dt>
              <dd>{p.valuationBasis.urgentSaleDiscountApplied ? "مُطبَّق" : "غير مُطبَّق"}</dd>
            </dl>
          </div>
        )}

        {/* د) وقائع المزاد */}
        {facts && (
          <div className="rpt__section">
            <h4>د) وقائع المزاد</h4>
            <dl className="kv">
              <dt>المزاد</dt><dd className="tnum">{facts.code}</dd>
              <dt>المنصة</dt><dd>{facts.platform}</dd>
              <dt>سعر الافتتاح</dt><dd className="tnum">{sar(facts.openingPrice)}</dd>
              <dt>سعر الترسية</dt><dd className="tnum">{sar(facts.hammerPrice)}</dd>
              <dt>عدد المزايدين</dt><dd className="tnum">{facts.bidderCount}</dd>
              <dt>عدد المزايدات</dt><dd className="tnum">{facts.bidCount}</dd>
            </dl>

            {curve.length > 1 && (
              <div style={{ marginTop: "var(--dga-space-xl)" }}>
                <div className="stat__label" style={{ marginBottom: 6 }}>منحنى السعر الزمني</div>
                <svg className="curve" viewBox="0 0 600 120" preserveAspectRatio="none">
                  {(() => {
                    const amts = curve.map((c) => c.amount);
                    const lo = Math.min(...amts), hi = Math.max(...amts);
                    const rng = hi - lo || 1;
                    const pts = curve.map((c, i) => [
                      (i / (curve.length - 1)) * 600,
                      112 - ((c.amount - lo) / rng) * 100,
                    ]);
                    const d = pts.map((pt, i) => `${i ? "L" : "M"}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(" ");
                    return (
                      <>
                        <path d={`${d} L600,120 L0,120 Z`} fill="var(--dga-color-sa-500)" opacity="0.13" />
                        <path d={d} fill="none" stroke="var(--dga-color-sa-600)" strokeWidth="2" />
                        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill="var(--dga-color-sa-700)" />
                      </>
                    );
                  })()}
                </svg>
                <div className="row row--between" style={{ fontSize: "var(--dga-font-size-2xs)", color: "var(--text-tertiary)" }}>
                  <span className="tnum">{num(Math.min(...curve.map((c) => c.amount)))}</span>
                  <span className="tnum">{num(Math.max(...curve.map((c) => c.amount)))} ر.س</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* هـ) الانحراف */}
        {p.deviation && (
          <div className="rpt__section">
            <h4>هـ) الانحراف</h4>
            <dl className="kv">
              <dt>الترسية مقابل التقييم</dt>
              <dd className="tnum">{p.deviation.hammerVsEstimate > 0 ? "+" : ""}{p.deviation.hammerVsEstimate}%</dd>
              <dt>الترسية مقابل الافتتاح</dt>
              <dd className="tnum">{p.deviation.hammerVsOpening > 0 ? "+" : ""}{p.deviation.hammerVsOpening}%</dd>
            </dl>
          </div>
        )}

        {/* و) ما بعد الترسية */}
        {p.postAward && (
          <div className="rpt__section">
            <h4>و) ما بعد الترسية</h4>
            {p.postAward.obligationsTransferred.length > 0 ? (
              <ul style={{ paddingInlineStart: 18, fontSize: "var(--dga-font-size-sm)", lineHeight: 1.9 }}>
                {p.postAward.obligationsTransferred.map((o) => <li key={o}>{o}</li>)}
              </ul>
            ) : (
              <p style={{ fontSize: "var(--dga-font-size-sm)" }}>لا التزامات ناقلة مرصودة.</p>
            )}
            <Alert tone="warning">{p.postAward.note}</Alert>
          </div>
        )}

        {/* الفاتورة */}
        <div className="rpt__section">
          <h4>الفاتورة</h4>
          <dl className="kv">
            <dt>رقم الفاتورة</dt><dd className="tnum">{invoice.invoiceNo}</dd>
            <dt>الصافي</dt><dd className="tnum">{num(invoice.net)} ر.س</dd>
            <dt>ضريبة القيمة المضافة {(invoice.vatRate * 100).toFixed(0)}%</dt>
            <dd className="tnum">{num(invoice.vat)} ر.س</dd>
            <dt>الإجمالي</dt><dd className="tnum"><b>{num(invoice.total)} ر.س</b></dd>
          </dl>
          <p className="note" style={{ marginTop: "var(--dga-space-lg)" }}>{invoice.compliance}</p>
        </div>
      </Card>
    </div>
  );
}
