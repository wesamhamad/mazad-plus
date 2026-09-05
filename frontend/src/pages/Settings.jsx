import { useEffect, useState } from "react";

import { api } from "../api";
import { Alert, Card, Loading, Tag } from "../components/ui";

const PACKAGES = [
  ["باقة الوكيل", "وكيل بيع فرد أو منشأة صغيرة — حتى 100 أصل", "800 ر.س / شهر"],
  ["باقة المنشأة", "وكيل بيع متوسط — حتى 400 أصل، مستخدمون متعددون", "2,000 ر.س / شهر"],
  ["ترخيص المنصة", "واجهة برمجية تُدمج داخل منصة مزادات معتمدة", "8,000 ر.س / شهر"],
  ["باقة فال الخفيفة", "بطاقة أصل وتسعير مبسّط لوسطاء العقار", "300 ر.س / شهر"],
  ["رسم الأصل الإضافي", "كل أصل معالَج فوق حصة الباقة", "15 ر.س / أصل"],
];

export default function Settings({ user }) {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.settings().then((d) => setSettings(d.settings)).catch((e) => setError(e.message));
  }, []);

  const canEdit = user.role === "compliance";

  async function save(key, value) {
    setBusy(key);
    setFlash(null);
    try {
      const res = await api.updateSetting(key, value);
      setSettings((prev) => prev.map((s) => (s.key === key ? res.setting : s)));
      setFlash({ tone: "success", text: `حُدّث «${res.setting.title}» وسُجّل التغيير في سجل التدقيق` });
    } catch (e) {
      setFlash({ tone: "error", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  if (error && !settings) return <Alert tone="error" title="تعذّر تحميل الإعدادات">{error}</Alert>;
  if (!settings) return <Loading />;

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>المعاملات النظامية</h1>
          <p className="pagehead__sub">
            قيم قابلة للضبط من لوحة الإعدادات — لا أرقام مكتوبة في الشيفرة
          </p>
        </div>
      </div>

      <Alert tone="warning" title="نظام التنفيذ الجديد (م/237) يُعمل به قرابة 28 أكتوبر 2026">
        لائحته التنفيذية لم تصدر بعد. المدد ومبالغ الضمان ومهل السداد قابلة للتغيير خلال أشهر —
        ولهذا صُمّمت هذه القيم معاملات في قاعدة البيانات لا ثوابت في الشيفرة. تغيير حد الجاهزية أو
        سقف العربون هنا ينعكس فوراً على حالة كل مزاد.
      </Alert>

      {!canEdit && (
        <Alert tone="info">
          تعديل المعاملات صلاحية مشرف الامتثال. ادخل بهوية{" "}
          <span className="tnum">1055501234</span> لتجربة التعديل.
        </Alert>
      )}

      {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}

      <Card>
        <div className="card__body">
          {settings.map((s) => (
            <div className="setting" key={s.key}>
              <div>
                <div className="setting__title">{s.title}</div>
                <div className="setting__desc">{s.description}</div>
                {s.basis && <div className="setting__basis">المرجع: {s.basis}</div>}
              </div>
              <div className="setting__control">
                <input
                  type="number"
                  className="input"
                  defaultValue={s.value}
                  disabled={!canEdit || busy === s.key}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v) && v !== s.value) save(s.key, v);
                  }}
                />
                <span className="setting__unit">{s.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="card__head">
          <h3>باقات الاشتراك</h3>
          <Tag tone="neutral">اشتراك ثابت — لا نسبة من الصفقة</Tag>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>الباقة</th>
                <th>الوصف</th>
                <th>السعر</th>
              </tr>
            </thead>
            <tbody>
              {PACKAGES.map(([name, desc, price]) => (
                <tr key={name}>
                  <td>
                    <strong>{name}</strong>
                  </td>
                  <td>{desc}</td>
                  <td className="tnum">{price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card__foot">
          <p className="note">
            قيد نظامي على التسعير: لا يوجد في هذا النموذج أي إيراد بنسبة من قيمة الصفقة أو من عمولة
            الوكيل. تعريف الوساطة العقارية مقيّد بعنصرين — التوسط في إتمام الصفقة، ومقابل عمولة —
            والاشتراك الثابت والرسم لكل أصل لا يستحضران ركن العمولة. قرار مالي مصدره الامتثال.
          </p>
        </div>
      </Card>
    </div>
  );
}
