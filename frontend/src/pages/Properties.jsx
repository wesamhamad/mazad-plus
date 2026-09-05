import { useEffect, useState } from "react";

const PAGE = 60;

import { api } from "../api";
import {
  Alert, Button, Card, Loading, num, Progress, readinessColor, Tag,
} from "../components/ui";

export default function Properties({ go }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [city, setCity] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    api.properties().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert tone="error" title="تعذّر تحميل الأصول">{error}</Alert>;
  if (!data) return <Loading />;

  const cities = [...new Set(data.properties.map((p) => p.city))].sort();
  const filtered = data.properties.filter((p) =>
    (city === "all" || p.city === city) &&
    (!q || (p.title + " " + (p.district || "") + " " + p.ref).includes(q)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const rows = filtered.slice(cur * PAGE, cur * PAGE + PAGE);

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>العقارات والأصول</h1>
          <p className="pagehead__sub">بطاقات الأصول ودرجة الجاهزية قبل الطرح</p>
        </div>
        <Tag tone="neutral">حد الطرح: {data.threshold} نقطة</Tag>
      </div>

      <div className="row row--wrap" style={{ gap: "var(--dga-space-md)" }}>
        <select className="input" style={{ width: "auto" }} value={city} onChange={(e) => { setCity(e.target.value); setPage(0); }}>
          <option value="all">كل المدن ({data.properties.length})</option>
          {cities.map((c) => <option key={c} value={c}>{c} ({data.properties.filter((p) => p.city === c).length})</option>)}
        </select>
        <input className="input" style={{ width: 260 }} placeholder="بحث بالعنوان أو الحي أو المرجع" value={q}
               onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <span className="stat__label"><span className="tnum">{filtered.length}</span> أصلاً · صفحة {cur + 1} من {pages}</span>
        <Button size="sm" variant="secondary" disabled={cur === 0} onClick={() => setPage(cur - 1)}>السابق</Button>
        <Button size="sm" variant="secondary" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>التالي</Button>
      </div>

      <Card>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>المرجع</th>
                <th>الوصف</th>
                <th>المدينة</th>
                <th>القيمة التقديرية</th>
                <th>الجاهزية</th>
                <th>المستندات</th>
                <th>الحالة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const required = { length: p.docsRequired };
                const done = p.docsPresent;
                return (
                  <tr key={p.ref}>
                    <td>
                      <strong className="tnum">{p.ref}</strong>
                    </td>
                    <td>{p.title}</td>
                    <td>{p.city}</td>
                    <td className="tnum">{num(p.estimatedValue)}</td>
                    <td style={{ minWidth: 140 }}>
                      <div className="row" style={{ gap: "var(--dga-space-md)" }}>
                        <span className="tnum" style={{ width: 26 }}>
                          {p.readinessScore}
                        </span>
                        <div style={{ flex: 1 }}>
                          <Progress value={p.readinessScore} color={readinessColor(p.readinessScore)} />
                        </div>
                      </div>
                    </td>
                    <td className="tnum">
                      {done} / {required.length}
                    </td>
                    <td>
                      {p.eligible ? (
                        <Tag tone="success">مؤهّل للطرح</Tag>
                      ) : (
                        <Tag tone="error">محجوب</Tag>
                      )}
                    </td>
                    <td>
                      <Button variant="ghost" size="sm" onClick={() => go("property", p.ref)}>
                        فتح
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="note">
        الحجب الآلي يعمل على مستوى البيانات فقط — اكتمال المستندات الإلزامية، وحداثة المعاينة،
        واكتمال حقول بطاقة الأصل، ووجود قيمة تقديرية. رفع الحجب يتم باستكمال الناقص، وكل تغيير
        يُسجَّل باسم المستخدم في سجل التدقيق.
      </p>
    </div>
  );
}
