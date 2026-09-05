import { useEffect, useState } from "react";

import { api } from "../api";
import { Alert, Card, Loading, num, Tag } from "../components/ui";

/** نموذج العمل — the four revenue sources, as fixed fees and subscriptions only. */
export default function Plans() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.plans().then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Loading />;
  return (
    <div className="stack">
      <div className="pagehead">
        <div><h1>نموذج العمل</h1><p className="pagehead__sub">أربعة مصادر إيراد — للفرد، وللوكيل، وللمؤسسة</p></div>
      </div>
      <div className="grid grid--2">
        {data.sources.map((src) => (
          <Card key={src.key} className="plan">
            <div className="card__head">
              <div><h3>{src.title}</h3><div className="regcard__entity">{src.audience}</div></div>
              <Tag tone={src.when === "من اليوم الأول" ? "success" : "neutral"}>{src.when}</Tag>
            </div>
            <div className="card__body plan__grid">
              {src.options.map((o) => (
                <div key={o.name} className={`plan__opt${o.price === null ? " plan__opt--enterprise" : ""}`}>
                  <b>{o.name}</b>
                  <div className="plan__price">{o.price === null ? "حسب الطلب" : <><span className="tnum">{num(o.price)}</span> <small>{o.unit}</small></>}</div>
                  <p>{o.desc}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <Alert tone="info">{data.principle} الأسعار غير شاملة ضريبة القيمة المضافة {(data.vatRate * 100).toFixed(0)}%.</Alert>
    </div>
  );
}
