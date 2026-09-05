import { useEffect, useState } from "react";

import { api } from "../api";
import { Alert, Card, Loading, Tag } from "../components/ui";

/**
 * سجل التكامل — what each official register actually requires.
 *
 * This page exists because the honest answer to "is this connected to the
 * government?" is "no, and here is exactly what it would take" — which is more
 * useful to a committee than a screen implying a link that does not exist.
 */
const STATUS = {
  public_api: { label: "واجهة عامة — تسجيل ذاتي", tone: "success" },
  partner_api: { label: "واجهة شركاء", tone: "info" },
  agreement_required: { label: "تلزم اتفاقية ربط", tone: "warning" },
  manual_portal_only: { label: "بوابة بشرية فقط", tone: "error" },
};

const IMPACT = {
  positive: { label: "اكتشاف مُمكِّن", tone: "success" },
  critical: { label: "يقلب افتراضاً", tone: "error" },
  design: { label: "يغيّر التصميم", tone: "warning" },
};

export default function IntegrationRegister() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.registryInfo().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert tone="error" title="تعذّر تحميل سجل التكامل">{error}</Alert>;
  if (!data) return <Loading />;

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>سجل التكامل</h1>
          <p className="pagehead__sub">
            ما تحتاجه كل سجل رسمي ليصبح ربطاً حقيقياً — ونتائج مسح المصادر
          </p>
        </div>
        <Tag tone="warning" dot>كل الموصّلات في وضع محاكاة</Tag>
      </div>

      <Alert tone="info" title="لماذا تُعرض هذه الصفحة أصلاً">
        الجواب الصادق على «هل المنصة مرتبطة بالجهات الحكومية؟» هو: لا، وهذا بالضبط ما يلزم لذلك.
        عرض هذا أنفع للجنة من شاشة توحي بربط غير قائم — والبنية مصمّمة بحيث يُستبدل الموصّل وحده
        عند منح الوصول، دون تغيير أي طبقة فوقه.
      </Alert>

      <div className="grid grid--2">
        {data.connectors.map((c) => {
          const st = STATUS[c.status] || STATUS.agreement_required;
          return (
            <Card key={c.key}>
              <div className="card__head">
                <div>
                  <h3>{c.nameAr}</h3>
                  <div className="regcard__entity">{c.entity}</div>
                </div>
                <Tag tone={st.tone}>{st.label}</Tag>
              </div>
              <div className="card__body stack" style={{ gap: "var(--dga-space-lg)" }}>
                <dl className="kv">
                  <dt>المعرّف</dt>
                  <dd style={{ fontSize: "var(--dga-font-size-xs)" }}>{c.identifier}</dd>
                </dl>
                <div>
                  <div className="stat__label">العائق</div>
                  <p style={{ fontSize: "var(--dga-font-size-xs)", lineHeight: 1.85, marginTop: 4 }}>
                    {c.blockers}
                  </p>
                </div>
                <div>
                  <div className="stat__label">المسار العملي</div>
                  <p style={{ fontSize: "var(--dga-font-size-xs)", lineHeight: 1.85, marginTop: 4,
                              color: "var(--text-secondary)" }}>
                    {c.onboarding}
                  </p>
                </div>
                {c.evidence?.length > 0 && (
                  <div className="flagrow__meta">
                    {c.evidence.map((e) => <code key={e}>{e.replace(/^https?:\/\//, "")}</code>)}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <div className="card__head">
          <h3>افتراضات قلبها المسح</h3>
          <Tag tone="error">{data.assumptionChanges.length}</Tag>
        </div>
        <div>
          {data.assumptionChanges.map((a) => {
            const im = IMPACT[a.impact] || IMPACT.design;
            return (
              <div className="flagrow" key={a.finding}>
                <span className={`flagrow__badge flagrow__badge--${a.impact === "positive" ? "amber" : "red"}`}>
                  {a.impact === "positive" ? "✓" : "!"}
                </span>
                <div className="flagrow__body">
                  <div className="row row--between" style={{ gap: "var(--dga-space-md)" }}>
                    <b>{a.finding}</b>
                    <Tag tone={im.tone}>{im.label}</Tag>
                  </div>
                  <p>{a.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="card__head">
          <h3>ما ينبغي طلبه من إنفاذ</h3>
          <Tag tone="neutral">الفصل ١٥</Tag>
        </div>
        <div className="card__body">
          <ol style={{ paddingInlineStart: 20, lineHeight: 2, fontSize: "var(--dga-font-size-sm)",
                       color: "var(--text-secondary)" }}>
            {data.chapter15Asks.map((a) => <li key={a}>{a}</li>)}
          </ol>
        </div>
        <div className="card__foot">
          <p className="note">
            طلب البيانات المحدّد بالاسم يُظهر أنك تفكّر في التشغيل لا في العرض — وهو ما صُمم له
            الفصل الخامس عشر من الدراسة.
          </p>
        </div>
      </Card>
    </div>
  );
}
