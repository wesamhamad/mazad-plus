import { useCallback, useEffect, useState } from "react";

import { api, getToken, setToken } from "./api";
import { GovBanner, Icon, icons, Loading } from "./components/ui";
import Footer from "./components/Footer";
import AccountMenu from "./components/AccountMenu";
import NafathLogin from "./pages/NafathLogin";
import Dashboard from "./pages/Dashboard";
import Auctions from "./pages/Auctions";
import AuctionDetail from "./pages/AuctionDetail";
import Properties from "./pages/Properties";
import PropertyDetail from "./pages/PropertyDetail";
import Fraud from "./pages/Fraud";
import Settings from "./pages/Settings";
import AuditTrail from "./pages/AuditTrail";
import Disclosure from "./pages/Disclosure";
import MapView from "./pages/MapView";
import { ReportsList, ReportView } from "./pages/Reports";
import IntegrationRegister from "./pages/IntegrationRegister";
import Compare from "./pages/Compare";
import Inquiry from "./pages/Inquiry";
import Plans from "./pages/Plans";

const THEME_KEY = "mazadplus.theme";

const NAV = [
  { group: "التشغيل", items: [
    { key: "dashboard", label: "لوحة القيادة", icon: icons.dashboard },
    { key: "auctions", label: "المزادات", icon: icons.gavel },
    { key: "properties", label: "العقارات والأصول", icon: icons.building },
    { key: "inquiry", label: "استعلام بالصك", icon: icons.shield },
    { key: "map", label: "الخريطة المقارنة", icon: icons.globe },
    { key: "reports", label: "التقارير المختومة", icon: icons.file },
    { key: "plans", label: "نموذج العمل", icon: icons.star },
  ]},
  { group: "الحوكمة والامتثال", items: [
    { key: "fraud", label: "رصد النزاهة", icon: icons.shield },
    { key: "registry", label: "سجل التكامل", icon: icons.link },
    { key: "settings", label: "المعاملات النظامية", icon: icons.sliders },
    { key: "audit", label: "سجل التدقيق", icon: icons.log },
  ]},
];

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [route, setRoute] = useState({ view: "dashboard", param: null });
  const [badges, setBadges] = useState({ auctions: 0, fraud: 0 });
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");
  const [menuOpen, setMenuOpen] = useState(false);

  // Drawer: closes on Escape, and locks page scroll while open.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  // Restore an existing session on reload rather than bouncing to the login.
  useEffect(() => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    api.me()
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  const refreshBadges = useCallback(() => {
    if (!getToken()) return;
    Promise.all([api.auctions("live"), api.fraudAlerts()])
      .then(([a, f]) => setBadges({
        auctions: a.auctions.length,
        fraud: f.alerts.filter((x) => x.state === "مفتوح").length,
      }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    refreshBadges();
    const id = setInterval(refreshBadges, 15000);
    return () => clearInterval(id);
  }, [user, refreshBadges]);

  const go = useCallback((view, param = null) => {
    setRoute({ view, param });
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  async function logout() {
    try {
      await api.logout();
    } finally {
      setToken(null);
      setUser(null);
      setRoute({ view: "dashboard", param: null });
    }
  }

  if (booting) return <Loading label="جارٍ استعادة الجلسة…" />;

  if (!user) {
    return <NafathLogin onAuthenticated={setUser} theme={theme} onToggleTheme={toggleTheme} />;
  }

  const shared = { user, go, refreshBadges };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <GovBanner />

      <header className="appheader">
        <div className="appheader__row">
          <button className="appheader__menu" aria-label="القائمة" aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}>
            <Icon path={menuOpen ? icons.close : icons.menu} size={22} strokeWidth={2} />
          </button>
          <div className="appheader__logo">
            <div className="appheader__mark">+م</div>
            <div>
              <div className="appheader__name">مزاد+</div>
              <div className="appheader__tagline">منصة المزادات العقارية المتخصصة</div>
            </div>
          </div>

          <div className="appheader__right">
            <button className="appheader__ghost" onClick={toggleTheme}>
              <Icon path={theme === "dark" ? icons.sun : icons.moon} size={14} />
              {theme === "dark" ? "فاتح" : "داكن"}
            </button>
            <AccountMenu user={user} onLogout={logout} onUserChange={setUser} />
          </div>
        </div>
      </header>

      {/* Mobile drawer — the same navigation, reachable with a thumb. */}
      {menuOpen && <div className="drawer__backdrop" onClick={() => setMenuOpen(false)} />}
      <nav className={`drawer${menuOpen ? " drawer--open" : ""}`} aria-hidden={!menuOpen}>
        <div className="drawer__user">
          <div className="appheader__avatar">{user.fullName.charAt(0)}</div>
          <div><b>{user.fullName}</b><span>{user.roleLabel}</span></div>
        </div>
        {NAV.map((section) => (
          <div key={section.group}>
            <div className="sidenav__group">{section.group}</div>
            {section.items.map((item) => (
              <button key={item.key} className={`navitem${route.view === item.key ? " navitem--active" : ""}`}
                      onClick={() => go(item.key)}>
                <Icon path={item.icon} />{item.label}
                {badges[item.key] > 0 && <span className="navitem__count">{badges[item.key]}</span>}
              </button>
            ))}
          </div>
        ))}
        <div className="drawer__foot">
          <button className="navitem" onClick={toggleTheme}>
            <Icon path={theme === "dark" ? icons.sun : icons.moon} />{theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
          </button>
          <button className="navitem" style={{ color: "var(--dga-color-error-600)" }} onClick={logout}>
            <Icon path={icons.logout} />تسجيل الخروج
          </button>
        </div>
      </nav>

      <div className="shell">
        <nav className="sidenav">
          {NAV.map((section) => (
            <div key={section.group}>
              <div className="sidenav__group">{section.group}</div>
              {section.items.map((item) => {
                const count = badges[item.key];
                const active = route.view === item.key
                  || (item.key === "auctions" && route.view === "auction")
                  || (item.key === "properties" && ["property", "disclosure", "compare"].includes(route.view))
                  || (item.key === "reports" && route.view === "report");
                return (
                  <button
                    key={item.key}
                    className={`navitem${active ? " navitem--active" : ""}`}
                    onClick={() => go(item.key)}
                  >
                    <Icon path={item.icon} />
                    {item.label}
                    {count > 0 && <span className="navitem__count">{count}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <main className="content">
          <div className="container">
            {route.view === "dashboard" && <Dashboard {...shared} />}
            {route.view === "auctions" && <Auctions {...shared} />}
            {route.view === "auction" && <AuctionDetail code={route.param} {...shared} />}
            {route.view === "properties" && <Properties {...shared} />}
            {route.view === "property" && <PropertyDetail refCode={route.param} {...shared} />}
            {route.view === "fraud" && <Fraud {...shared} />}
            {route.view === "settings" && <Settings {...shared} />}
            {route.view === "audit" && <AuditTrail {...shared} />}
            {route.view === "disclosure" && <Disclosure refCode={route.param} {...shared} />}
            {route.view === "map" && <MapView {...shared} />}
            {route.view === "reports" && <ReportsList {...shared} />}
            {route.view === "report" && <ReportView code={route.param} {...shared} />}
            {route.view === "registry" && <IntegrationRegister {...shared} />}
            {route.view === "compare" && <Compare refCode={route.param} {...shared} />}
            {route.view === "inquiry" && <Inquiry {...shared} />}
            {route.view === "plans" && <Plans {...shared} />}
          </div>
        </main>
      </div>

      <Footer go={go} />

      {/* Bottom tab bar — the four destinations a buyer actually uses on a phone. */}
      <nav className="tabbar" aria-label="التنقل السريع">
        {[
          ["dashboard", "الرئيسية", icons.dashboard],
          ["auctions", "المزادات", icons.gavel],
          ["map", "الخريطة", icons.globe],
          ["inquiry", "استعلام", icons.shield],
        ].map(([key, label, icon]) => (
          <button key={key} className={`tabbar__item${route.view === key ? " is-active" : ""}`} onClick={() => go(key)}>
            <Icon path={icon} size={20} />
            <span>{label}</span>
          </button>
        ))}
        <button className={`tabbar__item${menuOpen ? " is-active" : ""}`} onClick={() => setMenuOpen((v) => !v)}>
          <Icon path={icons.menu} size={20} /><span>المزيد</span>
        </button>
      </nav>
    </div>
  );
}
