import { useEffect, useState } from "react";

import { api } from "../api";
import { Alert, Button, Card, Icon, icons, Loading, num, sar, Tag } from "../components/ui";

/**
 * كشف الأصل — the pre-bid disclosure.
 *
 * The whole point of this screen is that a bidder decides BEFORE paying a
 * deposit. So every field states which register it came from and when it was
 * pulled, and every flag states the rule that fired it. A disclosure field
 * without a dated source is not evidence, and is not rendered as one.
 */

const STATUS_LABEL = {
  public_api: { label: "واجهة عامة", tone: "success" },
  partner_api: { label: "واجهة شركاء", tone: "info" },
  agreement_required: { label: "تلزم اتفاقية ربط", tone: "warning" },
  manual_portal_only: { label: "بوابة بشرية فقط", tone: "error" },
};

function FlagRow({ flag }) {
  const red = flag.level === "red";
  return (
    <div className="flagrow">
      <span className={`flagrow__badge flagrow__badge--${red ? "red" : "amber"}`}>
        {red ? "⛔" : "⚠"}
      </span>
      <div className="flagrow__body">
        <b>{flag.title}</b>
        <p>{flag.detail}</p>
        <div className="flagrow__meta">
          <span>المصدر: {flag.source}</span>
          <span>·</span>
          <span>
            القاعدة: <code>{flag.rule}</code>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Disclosure({ refCode, go, user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [registry, setRegistry] = useState(null);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setData(null);
    api.disclosure(refCode).then(setData).catch((e) => setError(e.message));
    api.registryInfo().then(setRegistry).catch(() => {});
  }, [refCode]);

  if (error) return <Alert tone="error" title="تعذّر تشغيل الاستعلام">{error}</Alert>;
  if (!data) return <Loading label="جارٍ استعلام السجلات الأربعة…" />;

  const { asset, auction, registers, flags, summary } = data;
  const reds = flags.filter((f) => f.level === "red");
  const ambers = flags.filter((f) => f.level === "amber");

  async function issue() {
    setBusy(true);
    try {
      const res = await api.issueDisclosure(refCode);
      setIssued(res.report);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="breadcrumb">
        <button onClick={() => go("properties")}>العقارات والأصول</button>
        <span>/</span>
        <button onClick={() => go("property", refCode)}>{refCode}</button>
        <span>/</span>
        <span>كشف الأصل</span>
      </div>

      <div className="pagehead">
        <div>
          <h1>كشف الأصل قبل المزايدة</h1>
          <p className="pagehead__sub">
            {asset.title} · {asset.city}
            {asset.district && asset.district !== "—" ? ` · ${asset.district}` : ""}
          </p>
        </div>
        <div className="row" style={{ gap: "var(--dga-space-md)" }}>
          <Button size="sm" variant="secondary" onClick={() => go("compare", refCode)}>المتشابهات</Button>
          {auction && (
            <Button size="sm" variant="secondary" onClick={() => go("auction", auction.code)}>
              فتح المزاد
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => go("property", refCode)}>
            <Icon path={icons.back} size={14} />
            رجوع
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------- the verdict */}
      <div className={`disc__verdict disc__verdict--${summary.tone}`}>
        <span className="disc__verdict-icon">
          {summary.tone === "error" ? "⛔" : summary.tone === "warning" ? "⚠" : "✓"}
        </span>
        <div>
          <b>{summary.verdict}</b>
          <span>
            {reds.length > 0
              ? "قيود تنتقل مع الأصل ولا يُسقطها قرار الترسية بالضرورة"
              : ambers.length > 0
              ? "لا قيود ناقلة، لكن في الأدلة ثغرات تستحق النظر"
              : "لم تُرصد قيود في السجلات الأربعة"}
          </span>
        </div>
        <div className="disc__counts">
          <div className="disc__count">
            <b style={{ color: "var(--dga-color-error-600)" }}>{summary.red}</b>
            <span>أحمر</span>
          </div>
          <div className="disc__count">
            <b style={{ color: "var(--dga-color-warning-600)" }}>{summary.amber}</b>
            <span>برتقالي</span>
          </div>
        </div>
      </div>

      <Alert tone="warning" title="السجلات الأربعة تعمل في وضع محاكاة">
        لا يمكن لمنصة خاصة اليوم الاستعلام المباشر من هذه السجلات — ثلاثة تحتاج اتفاقية ربط
        والرابع بوابة بشرية. ما تراه أدناه مخرجات محاكاة ثابتة لكل صك، والبنية جاهزة لاستبدال
        الموصّل بالربط الحقيقي دون تغيير أي شيء فوقه.
      </Alert>

      <div className="grid grid--split">
        <div className="stack">
          {/* ------------------------------------------------------- flags */}
          <Card>
            <div className="card__head">
              <h3>القيود والملاحظات المرصودة</h3>
              <Tag tone={reds.length ? "error" : ambers.length ? "warning" : "success"}>
                {flags.length} بند
              </Tag>
            </div>
            {flags.length === 0 ? (
              <div className="empty">لم يرصد محرّك القواعد أي قيد على هذا الأصل</div>
            ) : (
              <div>
                {reds.map((f) => <FlagRow key={f.code} flag={f} />)}
                {ambers.map((f) => <FlagRow key={f.code} flag={f} />)}
              </div>
            )}
            <div className="card__foot">
              <p className="note">
                كل علم أعلاه ناتج قاعدة صريحة لا نموذج لغوي — عمداً. المزايد على وشك دفع عربون،
                وقول «هذا العقار متعذّر إخلاؤه» يجب أن يكون قابلاً للإرجاع إلى حقل مُسمّى من سجل
                مُسمّى بتاريخ مُسمّى، وهو ما تفعله القاعدة ولا يفعله النموذج.
              </p>
            </div>
          </Card>

          {/* --------------------------------------------------- registers */}
          <Card>
            <div className="card__head">
              <h3>مخرجات السجلات</h3>
              <Tag tone="neutral">4 سجلات</Tag>
            </div>
            <div className="card__body grid grid--2">
              {Object.entries(registers).map(([key, r]) => (
                <div className="regcard" key={key}>
                  <div className="regcard__top">
                    <div>
                      <b>{r.source}</b>
                      <div className="regcard__entity">{r.entity}</div>
                    </div>
                    <Tag tone={r.ok ? "info" : "neutral"}>{r.ok ? "محاكاة" : "تعذّر"}</Tag>
                  </div>
                  {r.note && <p className="regcard__kv">{r.note}</p>}
                  <div className="regcard__kv">
                    سُحب في{" "}
                    <span className="tnum">
                      {new Date(r.fetchedAt).toLocaleString("en-GB", { hour12: false })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="card__foot">
              <p className="note">{data.privacyNote}</p>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <div className="card__head"><h3>الأصل</h3></div>
            <div className="card__body">
              <dl className="kv">
                <dt>المرجع</dt><dd className="tnum">{asset.ref}</dd>
                <dt>النوع</dt><dd>{asset.subtype}</dd>
                <dt>المدينة</dt><dd>{asset.city}</dd>
                {asset.areaSqm && (<><dt>المساحة</dt><dd className="tnum">{num(asset.areaSqm)} م²</dd></>)}
                <dt>رقم الصك</dt>
                <dd className="tnum">{asset.deedNumber || "—"}</dd>
                <dt>القيمة التقديرية</dt><dd className="tnum">{sar(asset.estimatedValue)}</dd>
                {auction && (<><dt>العربون</dt><dd className="tnum">{sar(auction.depositAmount)}</dd></>)}
              </dl>
            </div>
          </Card>

          <Card>
            <div className="card__head">
              <h3>إصدار كشف مختوم</h3>
              <Tag tone="neutral">49 ر.س</Tag>
            </div>
            <div className="card__body stack stack--sm">
              {issued ? (
                <>
                  <Alert tone="success" title={`صدر الكشف ${issued.code}`}>
                    بصمة المحتوى <span className="tnum">{issued.contentHash.slice(0, 16)}…</span>
                  </Alert>
                  <Button variant="secondary" onClick={() => go("report", issued.code)}>
                    فتح الكشف المختوم
                  </Button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: "var(--dga-font-size-xs)", color: "var(--text-tertiary)", lineHeight: 1.8 }}>
                    الاستعلام أعلاه مجاني. الإصدار يجمّد هذه النتيجة في وثيقة مختومة ببصمة تجزئة
                    وطابع زمني — تصلح للاحتجاج بها لاحقاً، وتُسجَّل في سجل التدقيق.
                  </p>
                  <Button block disabled={busy} onClick={issue}>
                    {busy ? "جارٍ الإصدار…" : "إصدار كشف مختوم"}
                  </Button>
                </>
              )}
            </div>
          </Card>

          {registry && (
            <Card>
              <div className="card__head">
                <h3>حالة الربط الحقيقي</h3>
              </div>
              <div className="card__body stack" style={{ gap: "var(--dga-space-lg)" }}>
                {registry.connectors.map((c) => {
                  const st = STATUS_LABEL[c.status] || STATUS_LABEL.agreement_required;
                  return (
                    <div key={c.key}>
                      <div className="row row--between" style={{ marginBottom: 4 }}>
                        <b style={{ fontSize: "var(--dga-font-size-xs)" }}>{c.nameAr}</b>
                        <Tag tone={st.tone}>{st.label}</Tag>
                      </div>
                      <p style={{ fontSize: "var(--dga-font-size-2xs)", color: "var(--text-tertiary)", lineHeight: 1.75 }}>
                        {c.blockers}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="card__foot">
                <Button variant="ghost" size="sm" block onClick={() => go("registry")}>
                  سجل التكامل الكامل وطلبات إنفاذ ←
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
