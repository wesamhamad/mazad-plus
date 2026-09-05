import { useEffect, useState } from "react";

import { api } from "../api";
import {
  Alert, Button, Card, Countdown, Icon, icons, Loading,
  money, num, Progress, sar, Tag,
} from "../components/ui";

/** Every capability the platform has, with the screen that proves it. */
const CAPABILITIES = [
  { icon: icons.building, route: "properties", title: "بطاقة أصل ودرجة جاهزية",
    body: "استخراج موحّد من مستندات المعاينة، ودرجة 0–100 تحجب الناقص عن الطرح وتسمّي سبب كل نقطة مخصومة." },
  { icon: icons.gavel, route: "properties", title: "تسعير مفسَّر واحتمالية ترسية",
    body: "نطاق سعر افتتاح مبني على المزادات المنتهية داخل المنصة، مع المقارنات وعوامل التعديل التي بُني عليها." },
  { icon: icons.user, route: "properties", title: "حلقة مراجعة بشرية إلزامية",
    body: "لا توصية تتحوّل إلى سعر إلا باعتماد مُقيّم معتمد، والتعديل مرفوض بلا سبب مسجّل." },
  { icon: icons.spark, route: "auctions", title: "مزايدة حية لحظية",
    body: "بث فوري للمزايدات عبر SSE، وعدّاد إغلاق، وحد أدنى للزيادة مطبَّق في الخادم." },
  { icon: icons.shield, route: "fraud", title: "رصد النجش والتواطؤ",
    body: "ثلاثة كواشف تعمل على المزايدات الفعلية — والمخرج تنبيه للمشرف، لا حظر آلي." },
  { icon: icons.lock, route: "auctions", title: "عربون بإقرار موثّق",
    body: "لا مزايدة قبل إقرار مسجّل بشروط العربون. ولا حقل «رسوم تأخير» في قاعدة البيانات أصلاً." },
  { icon: icons.sliders, route: "settings", title: "معاملات نظامية قابلة للضبط",
    body: "المدد والسقوف والمهل من لوحة إعدادات لا من الشيفرة — استعداداً للائحة نظام التنفيذ الجديد." },
  { icon: icons.log, route: "audit", title: "سجل تدقيق مترابط بالتجزئة",
    body: "كل مخرج آلي وقرار بشري مسجّل ومربوط ببصمة سابقه، والبيانات الشخصية خارج السلسلة." },
];

function Stat({ label, value, unit, foot }) {
  return (
    <Card>
      <div className="card__body">
        <div className="stat__label">{label}</div>
        <div className="stat__value tnum">
          {value}
          {unit && <span className="stat__unit">{unit}</span>}
        </div>
        {foot && <div className="stat__foot">{foot}</div>}
      </div>
    </Card>
  );
}

export default function Dashboard({ go }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.dashboard()
        .then((d) => alive && setData(d))
        .catch((e) => alive && setError(e.message));
    load();
    const id = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error) return <Alert tone="error" title="تعذّر تحميل لوحة القيادة">{error}</Alert>;
  if (!data) return <Loading />;

  const { stats, liveAuctions, market, notifications } = data;
  const listed = money(stats.listedValue);

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>لوحة القيادة</h1>
          <p className="pagehead__sub">مؤشرات المنصة والمزادات الجارية — بيانات تجريبية محلية</p>
        </div>
        <Tag tone="success" dot>متصل بالخادم</Tag>
      </div>

      <div className="grid grid--4">
        <Stat
          label="قيمة الأصول المطروحة"
          value={listed.value}
          unit={listed.unit}
          foot={<span>{stats.liveAuctions + stats.upcomingAuctions} مزاد جارٍ وقادم</span>}
        />
        <Stat
          label="مزادات جارية الآن"
          value={stats.liveAuctions}
          foot={<span>{stats.upcomingAuctions} مزاد قادم</span>}
        />
        <Stat
          label="متوسط درجة الجاهزية"
          value={stats.avgReadiness}
          unit="/ 100"
          foot={
            stats.blockedAssets > 0 ? (
              <>
                <Tag tone="error">{stats.blockedAssets} محجوب</Tag>
                <span>من أصل {stats.totalAssets} أصلاً</span>
              </>
            ) : (
              <span>كل الأصول مؤهّلة للطرح</span>
            )
          }
        />
        <Stat
          label="تنبيهات نزاهة مفتوحة"
          value={stats.openAlerts}
          foot={
            stats.openAlerts > 0 ? (
              <span style={{ color: "var(--tint-warning-fg)" }}>تنتظر قراراً بشرياً</span>
            ) : (
              <span>لا تنبيهات مفتوحة</span>
            )
          }
        />
      </div>

      <div className="grid grid--split">
        <Card>
          <div className="card__head">
            <h3 className="row" style={{ gap: "var(--dga-space-md)" }}>
              <span className="livedot" />
              المزادات الجارية
            </h3>
            <Button variant="ghost" size="sm" onClick={() => go("auctions")}>
              عرض الكل
            </Button>
          </div>
          {liveAuctions.length === 0 ? (
            <div className="empty">لا توجد مزادات جارية حالياً</div>
          ) : (
            <div>
              {liveAuctions.map((a) => (
                <div
                  key={a.code}
                  className="bidrow"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => go("auction", a.code)}
                  onKeyDown={(e) => e.key === "Enter" && go("auction", a.code)}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: "var(--dga-font-weight-semibold)" }}>
                      {a.property.title}
                    </div>
                    <div className="bidrow__time">
                      {a.property.city} · منصة {a.platform} ·{" "}
                      <span className="tnum">{a.bidderCount}</span> مزايد ·{" "}
                      <span className="tnum">{a.bidCount}</span> مزايدة
                    </div>
                  </div>
                  <div style={{ textAlign: "left", flex: "none" }}>
                    <div className="bidrow__amount">{sar(a.currentPrice)}</div>
                    <div className="bidrow__time">
                      <Countdown endsAt={a.endsAt} compact />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="stack">
          <Card>
            <div className="card__head">
              <h3>مقام السوق</h3>
              <Tag tone="neutral">أرقام موثّقة</Tag>
            </div>
            <div className="card__body stack stack--sm">
              <dl className="kv">
                <dt>مبيعات إنفاذ — النصف الأول 2026</dt>
                <dd className="tnum">10.7 مليار ر.س</dd>
                <dt>عدد المزادات</dt>
                <dd className="tnum">{num(market.infathH1Auctions)} مزاداً</dd>
                <dt>الأصول المصفّاة</dt>
                <dd className="tnum">{num(market.infathH1Assets)} أصلاً</dd>
                <dt>المنصات المعتمدة لدى إنفاذ</dt>
                <dd className="tnum">{market.accreditedPlatforms} منصات</dd>
                <dt>منشآت مرخّصة بفال للمزادات</dt>
                <dd className="tnum">{num(market.falAuctionLicenses)} منشأة</dd>
              </dl>

              <div>
                <div className="stat__label" style={{ marginBottom: "var(--dga-space-md)" }}>
                  توزّع رخص فال للمزادات العقارية
                </div>
                <div className="stack" style={{ gap: "var(--dga-space-lg)" }}>
                  {market.licensesByRegion.map((r) => (
                    <div key={r.region}>
                      <div
                        className="row row--between"
                        style={{ fontSize: "var(--dga-font-size-xs)", marginBottom: 4 }}
                      >
                        <span>{r.region}</span>
                        <span className="tnum" style={{ color: "var(--text-tertiary)" }}>
                          {r.count}
                        </span>
                      </div>
                      <Progress value={(r.count / market.falAuctionLicenses) * 100} />
                    </div>
                  ))}
                </div>
              </div>

              <p className="note">{market.source}</p>
              {market.aggregates?.length > 0 && (
                <div>
                  <div className="stat__label" style={{ marginBottom: "var(--dga-space-md)" }}>نتائج إنفاذ المنشورة</div>
                  <div className="table-scroll">
                    <table className="table">
                      <thead><tr><th>الفترة</th><th>المنطقة</th><th>مزادات</th><th>أصول</th><th>القيمة</th></tr></thead>
                      <tbody>
                        {market.aggregates.slice(0, 8).map((a, i) => (
                          <tr key={i} title={a.source_name || ""}>
                            <td style={{ whiteSpace: "nowrap" }}>{a.period}</td>
                            <td>{a.region || "المملكة"}</td>
                            <td className="tnum">{a.auctions_count ?? "—"}</td>
                            <td className="tnum">{a.assets_count ?? "—"}</td>
                            <td className="tnum">{a.total_value_sar ? money(a.total_value_sar).value + " " + money(a.total_value_sar).unit : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="note" style={{ marginTop: "var(--dga-space-md)" }}>إعلانات إنفاذ عبر واس وأرقام وأملاك — إجماليات فقط؛ المركز لا ينشر نتائج لكل أصل.</p>
                </div>
              )}
            </div>
          </Card>

          {notifications.length > 0 && (
            <Card>
              <div className="card__head">
                <h3 className="row" style={{ gap: "var(--dga-space-md)" }}>
                  <Icon path={icons.bell} size={16} />
                  الإشعارات
                </h3>
              </div>
              <div>
                {notifications.slice(0, 4).map((n) => (
                  <div key={n.id} className="bidrow">
                    <div>
                      <div style={{ fontWeight: "var(--dga-font-weight-medium)" }}>{n.title}</div>
                      <div className="bidrow__time">{n.body}</div>
                    </div>
                    <Tag tone={n.tone}>{
                      { warning: "تنبيه", error: "حرج", info: "معلومة", success: "تم" }[n.tone] || "—"
                    }</Tag>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <div>
        <div className="pagehead" style={{ marginBottom: "var(--dga-space-xl)" }}>
          <div>
            <h1 style={{ fontSize: "var(--dga-font-size-lg)" }}>خصائص المنصة</h1>
            <p className="pagehead__sub">كل خاصية قابلة للفتح والتجربة — اضغط أي بطاقة</p>
          </div>
        </div>
        <div className="tour">
          {CAPABILITIES.map((c) => (
            <button className="tour__item" key={c.title} onClick={() => go(c.route)}>
              <span className="tour__icon">
                <Icon path={c.icon} size={18} />
              </span>
              <b>{c.title}</b>
              <p>{c.body}</p>
              <span className="tour__go">افتح ←</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
