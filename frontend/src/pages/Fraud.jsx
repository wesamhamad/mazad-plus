import { useEffect, useState } from "react";

import { api } from "../api";
import { Alert, Button, Card, Loading, Tag } from "../components/ui";

const ACTIONS = [
  ["محال للمنافسة", "إحالة للهيئة العامة للمنافسة", "primary"],
  ["قيد المراجعة", "مراجعة موسّعة", "secondary"],
  ["مغلق", "إغلاق — لا شبهة كافية", "ghost"],
];

const sevTone = (s) => (s === "عالٍ" ? "error" : s === "متوسط" ? "warning" : "info");
const stateTone = (s) =>
  s === "مفتوح" ? "warning" : s === "مغلق" ? "neutral" : s === "محال للمنافسة" ? "error" : "info";

export default function Fraud({ user, refreshBadges }) {
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.fraudAlerts().then((d) => setAlerts(d.alerts)).catch((e) => setError(e.message));
  }, []);

  const isCompliance = user.role === "compliance";

  async function decide(alert, state) {
    setBusy(alert.code);
    try {
      const res = await api.alertDecision(alert.code, state);
      setAlerts((prev) => prev.map((a) => (a.code === alert.code ? res.alert : a)));
      refreshBadges?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (error && !alerts) return <Alert tone="error" title="تعذّر تحميل التنبيهات">{error}</Alert>;
  if (!alerts) return <Loading />;

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>رصد نزاهة المزايدة</h1>
          <p className="pagehead__sub">
            كشف أنماط النجش والتواطؤ — تنبيهات للمشرف، ولا حظر آلي بأي حال
          </p>
        </div>
        <span className="aichip">إشارات متعددة — ليست دليلاً</span>
      </div>

      <Alert tone="info" title="سند شرعي ونظامي صريح">
        النجش — أن يزيد في السلعة من لا يريد شراءها ليغتر به المشتري — منهيٌّ عنه بنص نبوي صريح،
        والتواطؤ في المزايدات محظور بنص نظام المنافسة. هذا المكوّن إنفاذٌ آلي لواجب قائم، لا ابتكار
        إداري. وعند ثبوت النجش لا يبطل البيع تلقائياً؛ للمتضرر خيار طلب الفسخ عند الغبن الفاحش.
      </Alert>

      {!isCompliance && (
        <Alert tone="warning">
          اتخاذ القرار على التنبيهات صلاحية مشرف الامتثال. ادخل بهوية{" "}
          <span className="tnum">1055501234</span> لتجربة هذا المسار.
        </Alert>
      )}

      {alerts.length === 0 ? (
        <Card>
          <div className="empty">لا توجد تنبيهات نزاهة</div>
        </Card>
      ) : (
        <div className="stack">
          {alerts.map((a) => (
            <Card key={a.code}>
              <div className="card__head">
                <div className="row row--wrap" style={{ gap: "var(--dga-space-lg)" }}>
                  <Tag tone={sevTone(a.severity)} dot>
                    خطورة {a.severity}
                  </Tag>
                  <h3>{a.title}</h3>
                  <span className="stat__label tnum">
                    {a.code} · {a.auctionCode}
                  </span>
                </div>
                <Tag tone={stateTone(a.state)}>{a.state}</Tag>
              </div>

              <div className="card__body stack stack--sm">
                <div>
                  <div className="stat__label" style={{ marginBottom: "var(--dga-space-md)" }}>
                    الإشارات المرصودة
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingInlineStart: 18,
                      lineHeight: 1.9,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {a.signals.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>

                <p className="note">{a.note}</p>

                {isCompliance && a.state !== "مغلق" && (
                  <div className="row row--wrap" style={{ gap: "var(--dga-space-md)" }}>
                    {ACTIONS.map(([state, label, variant]) => (
                      <Button
                        key={state}
                        size="sm"
                        variant={variant}
                        disabled={busy === a.code || a.state === state}
                        onClick={() => decide(a, state)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
