import { Icon, icons } from "./ui";

/**
 * تذييل المنصة — platform footer.
 *
 * It also carries the demo disclosure, so the statement lives somewhere
 * permanent and legible instead of a banner pinned across the top of the app.
 */
const COLUMNS = [
  {
    title: "المنصة",
    links: [
      ["لوحة القيادة", "dashboard"],
      ["المزادات", "auctions"],
      ["العقارات والأصول", "properties"],
    ],
  },
  {
    title: "الحوكمة والامتثال",
    links: [
      ["رصد النزاهة", "fraud"],
      ["المعاملات النظامية", "settings"],
      ["سجل التدقيق", "audit"],
    ],
  },
  {
    title: "المرجعيات النظامية",
    links: [
      ["نظام التنفيذ (م/237)", null],
      ["اللائحة التنظيمية للمزادات العقارية", null],
      ["نظام حماية البيانات الشخصية", null],
      ["مبادئ سدايا للذكاء الاصطناعي", null],
      ["الضوابط الأساسية للأمن السيبراني", null],
    ],
  },
];

export default function Footer({ go }) {
  return (
    <footer className="footer">
      <div className="footer__grid">
        <div>
          <div className="footer__brand">
            <div className="footer__mark">+م</div>
            <div>
              <b>مزاد+</b>
              <span>منصة المزادات العقارية المتخصصة</span>
            </div>
          </div>
          <p className="footer__about">
            طبقة جاهزية وتسعير تسبق طرح الأصل في المزاد، تخدم وكلاء البيع والمنصات المعتمدة لدى
            مركز الإسناد والتصفية «إنفاذ» بدل منافستها. الذكاء الاصطناعي فيها مساعِد قرار لا متخذ
            قرار، بحلقة مراجعة بشرية إلزامية وسجل تدقيق مترابط بالتجزئة.
          </p>
          <div className="footer__badges">
            <span className="footer__badge">
              <Icon path={icons.check} size={11} strokeWidth={2.5} />
              كود المنصات — DGA
            </span>
            <span className="footer__badge">WCAG 2.1 AA</span>
            <span className="footer__badge">RTL</span>
            <span className="footer__badge">بيانات داخل المملكة</span>
          </div>
        </div>

        {COLUMNS.map((col) => (
          <div className="footer__col" key={col.title}>
            <h4>{col.title}</h4>
            <ul>
              {col.links.map(([label, route]) => (
                <li key={label}>
                  {route ? (
                    <button onClick={() => go(route)}>{label}</button>
                  ) : (
                    label
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="footer__bar">
        <div className="footer__bar-inner">
          <span>© 2026 مزاد+ — جميع الحقوق محفوظة</span>
          <span className="footer__demo">
            <Icon path={icons.alert} size={11} strokeWidth={2.2} />
            نموذج تجريبي — الدخول محاكاة لنفاذ ولا يمثّل جهة حكومية
          </span>
          <span>تشغيل محلي · Flask + React</span>
        </div>
      </div>
    </footer>
  );
}
