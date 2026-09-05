import { useEffect, useState } from "react";

import { api } from "../api";
import { Alert, Button, Card, Loading, Tag } from "../components/ui";

const KIND = {
  ai: { label: "ذكاء اصطناعي", tone: "info" },
  human: { label: "إجراء بشري", tone: "success" },
  config: { label: "إعدادات", tone: "warning" },
  system: { label: "النظام", tone: "neutral" },
};

const FILTERS = [["all", "الكل"], ["ai", "ذكاء اصطناعي"], ["human", "بشري"], ["config", "إعدادات"]];

export default function AuditTrail() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.audit()
        .then((d) => alive && setData(d))
        .catch((e) => alive && setError(e.message));
    load();
    const id = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error) return <Alert tone="error" title="تعذّر تحميل السجل">{error}</Alert>;
  if (!data) return <Loading />;

  const rows = filter === "all" ? data.entries : data.entries.filter((e) => e.actorKind === filter);

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>سجل التدقيق</h1>
          <p className="pagehead__sub">
            كل مخرج آلي وكل قرار بشري مسجّل بالوقت والمستخدم والمدخل
          </p>
        </div>
        <div className="row" style={{ gap: "var(--dga-space-md)" }}>
          {data.chain.valid ? (
            <Tag tone="success" dot>سلسلة التجزئة سليمة</Tag>
          ) : (
            <Tag tone="error" dot>انكسار في السلسلة عند #{data.chain.brokenAt}</Tag>
          )}
          <Tag tone="neutral">
            <span className="tnum">{data.entries.length}</span> قيد
          </Tag>
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
            <span className="tnum" style={{ opacity: 0.75 }}>
              {key === "all"
                ? data.entries.length
                : data.entries.filter((e) => e.actorKind === key).length}
            </span>
          </Button>
        ))}
      </div>

      <Card>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>الوقت</th>
                <th>المصدر</th>
                <th>الإجراء</th>
                <th>التفاصيل</th>
                <th>البصمة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const kind = KIND[row.actorKind] || KIND.system;
                return (
                  <tr key={row.id}>
                    <td className="tnum" style={{ whiteSpace: "nowrap" }}>
                      {new Date(row.createdAt).toLocaleTimeString("en-GB", { hour12: false })}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Tag tone={kind.tone}>{kind.label}</Tag>
                    </td>
                    <td>
                      <strong>{row.action}</strong>
                      <div style={{ fontSize: "var(--dga-font-size-xs)", color: "var(--text-tertiary)" }}>
                        {row.actor}
                      </div>
                    </td>
                    <td>{row.detail}</td>
                    <td className="tnum" style={{ color: "var(--text-tertiary)", fontSize: "var(--dga-font-size-xs)" }}>
                      {row.entryHash}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="note">
        السجل ملحق فقط (append-only) ومترابط بالتجزئة: كل قيد يحمل بصمة القيد الذي قبله، فأي تعديل
        رجعي يكسر السلسلة ويظهر فوراً في الشريط أعلاه. والبيانات الشخصية تبقى خارج الحمولة
        المترابطة — تُثبَّت البصمة فقط — حتى يظل حق طلب الإتلاف في نظام حماية البيانات الشخصية
        قابلاً للتنفيذ تقنياً. وهذا هو الجواب على سؤال «لماذا ليست سلسلة كتل؟»: سجل موقّع
        تشفيرياً يحقّق إثبات عدم العبث نفسه بتعقيد أقل، وبلا تعارض مع حق الإتلاف.
      </p>
    </div>
  );
}
