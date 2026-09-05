/**
 * مكوّنات كود المنصات — DGA Platforms Code component layer.
 *
 * Every visual value here resolves to a --dga-* token from
 * @maldarabseh/dga-tokens; these are the compositions, not a second palette.
 */
import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ icons */
export function Icon({ path, size = 18, strokeWidth = 1.7, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {path}
    </svg>
  );
}

export const icons = {
  dashboard: (<><rect x="3" y="3" width="7" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>),
  gavel: (<><path d="M14 4l6 6-3 3-6-6z" /><path d="M9 9l6 6" /><path d="M4 20h9" /><path d="M6.5 17.5l4-4" /></>),
  building: (<><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>),
  shield: (<><path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z" /><path d="M12 9v4M12 16v.1" /></>),
  sliders: (<><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="16" cy="18" r="2" /></>),
  log: (<><path d="M9 3h9a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V7z" /><path d="M9 3v4H5" /><path d="M9 12h7M9 16h5" /></>),
  logout: (<><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>),
  check: <path d="M4 12.5l5 5L20 7" />,
  alert: (<><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17v.1" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.1" /></>),
  back: <path d="M15 5l-7 7 7 7" />,
  link: (<><path d="M10 13a5 5 0 007.5.5l2-2a5 5 0 00-7-7l-1 1" /><path d="M14 11a5 5 0 00-7.5-.5l-2 2a5 5 0 007 7l1-1" /></>),
  lock: (<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  moon: <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />,
  globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 010 18 15 15 0 010-18z" /></>),
  bell: (<><path d="M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6z" /><path d="M13.7 20a2 2 0 01-3.4 0" /></>),
  chevron: <path d="M6 9l6 6 6-6" />,
  phone: (<><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18.5h2" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 20.5c1.2-4 4.3-6.2 8-6.2s6.8 2.2 8 6.2" /></>),
  eye: (<><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  eyeOff: (<><path d="M10.6 6.1A9.9 9.9 0 0112 6c6.4 0 10 6 10 6a17 17 0 01-3.2 3.9M6.2 6.3A17 17 0 002 12s3.6 6.5 10 6.5a9.8 9.8 0 004.2-.9" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /><path d="M3 3l18 18" /></>),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  file: (<><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>),
  seal: (<><circle cx="12" cy="10" r="6" /><path d="M9 15.5V21l3-1.6 3 1.6v-5.5" /><path d="M10 10l1.5 1.5L14.5 8.5" /></>),
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" />,
  spark: (<><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5L15 9M9 15l-2.5 2.5" /></>),
};

/* ---------------------------------------------------------------- controls */
export function Button({ variant = "primary", size, block, children, ...rest }) {
  const cls = ["btn", `btn--${variant}`, size && `btn--${size}`, block && "btn--block"]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

export function Card({ children, className = "", ...rest }) {
  return (
    <div className={`card ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export function Tag({ tone = "neutral", dot, children }) {
  return (
    <span className={`tag tag--${tone}`}>
      {dot && <span className="tag__dot" />}
      {children}
    </span>
  );
}

const ALERT_ICON = { success: icons.check, warning: icons.alert, error: icons.alert, info: icons.info };

export function Alert({ tone = "info", title, children }) {
  return (
    <div className={`alert alert--${tone}`} role={tone === "error" ? "alert" : undefined}>
      <Icon path={ALERT_ICON[tone]} size={18} />
      <div>
        {title && <b>{title}</b>}
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="field">
      {label && (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="field__error">
          <Icon path={icons.alert} size={13} strokeWidth={2} />
          {error}
        </p>
      ) : (
        hint && <p className="field__hint">{hint}</p>
      )}
    </div>
  );
}

export function Progress({ value, color }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress__fill" style={{ width: `${pct}%`, background: color || "var(--dga-color-primary)" }} />
    </div>
  );
}

export function Loading({ label = "جارٍ التحميل…" }) {
  return (
    <div className="loading">
      <span className="spinner" />
      {label}
    </div>
  );
}

/* ------------------------------------------------------------- formatting */
const NUM = new Intl.NumberFormat("en-US");
/** null/undefined = "not published" — shown as such, never as a fake zero. */
export const num = (n) => (n === null || n === undefined ? "—" : NUM.format(Math.round(n)));
export const sar = (n) => (n === null || n === undefined ? "غير منشور" : `${num(n)} ر.س`);

/** Compact money for stat tiles — 10.7 مليون / 1.2 مليار. */
export function money(n) {
  if (!n) return { value: "0", unit: "ر.س" };
  if (n >= 1e9) return { value: (n / 1e9).toFixed(1), unit: "مليار ر.س" };
  if (n >= 1e6) return { value: (n / 1e6).toFixed(1), unit: "مليون ر.س" };
  if (n >= 1e3) return { value: (n / 1e3).toFixed(0), unit: "ألف ر.س" };
  return { value: num(n), unit: "ر.س" };
}

export const readinessTone = (s) =>
  s >= 85 ? "success" : s >= 70 ? "info" : s >= 50 ? "warning" : "error";

export const readinessColor = (s) =>
  s >= 85
    ? "var(--dga-color-success-500)"
    : s >= 70
    ? "var(--dga-color-info-500)"
    : s >= 50
    ? "var(--dga-color-warning-500)"
    : "var(--dga-color-error-500)";

export const AUCTION_STATUS = {
  live: { label: "مزاد جارٍ", tone: "success" },
  upcoming: { label: "قادم", tone: "info" },
  blocked: { label: "محجوب", tone: "error" },
  draft: { label: "مسودة", tone: "neutral" },
  closed: { label: "منتهٍ", tone: "neutral" },
  cancelled: { label: "ملغى", tone: "neutral" },
};

/* ------------------------------------------------------------- countdown */
export function useCountdown(isoString) {
  const target = isoString ? new Date(isoString).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, target - now);
  return {
    days: Math.floor(remaining / 86400000),
    hours: Math.floor(remaining / 3600000) % 24,
    minutes: Math.floor(remaining / 60000) % 60,
    seconds: Math.floor(remaining / 1000) % 60,
    total: remaining,
    ended: target > 0 && remaining === 0,
  };
}

export function Countdown({ endsAt, compact }) {
  const cd = useCountdown(endsAt);
  const urgent = cd.total > 0 && cd.total < 10 * 60 * 1000;
  const boxClass = `countdown__box${urgent ? " countdown__box--urgent" : ""}`;

  if (cd.ended) return <Tag tone="neutral">انتهى الوقت</Tag>;
  if (compact) {
    return (
      <span className="tnum" style={{ color: urgent ? "var(--dga-color-error-600)" : "inherit" }}>
        {cd.days > 0 && `${cd.days}ي `}
        {String(cd.hours).padStart(2, "0")}:{String(cd.minutes).padStart(2, "0")}:
        {String(cd.seconds).padStart(2, "0")}
      </span>
    );
  }
  return (
    <div className="countdown">
      {cd.days > 0 && (
        <div className="countdown__box">
          <div className="countdown__n">{cd.days}</div>
          <div className="countdown__l">يوم</div>
        </div>
      )}
      <div className={boxClass}>
        <div className="countdown__n">{String(cd.hours).padStart(2, "0")}</div>
        <div className="countdown__l">ساعة</div>
      </div>
      <div className={boxClass}>
        <div className="countdown__n">{String(cd.minutes).padStart(2, "0")}</div>
        <div className="countdown__l">دقيقة</div>
      </div>
      <div className={boxClass}>
        <div className="countdown__n">{String(cd.seconds).padStart(2, "0")}</div>
        <div className="countdown__l">ثانية</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- gov + demo bars */
export function DemoBanner() {
  return (
    <div className="demobar">
      <strong>نموذج تجريبي (Demo)</strong> — هذه الصفحة محاكاة لواجهة النفاذ الوطني الموحد لأغراض
      العرض فقط، وليست اتصالاً حقيقياً بنفاذ. لا تُدخل بيانات حقيقية.
    </div>
  );
}

/** The official-government banner used across DGA platforms and Nafath. */
export function GovBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="govbar">
      <div className="govbar__row">
        <span className="govbar__flag" aria-hidden="true">
          ✦
        </span>
        <span className="govbar__text">موقع حكومي رسمي تابع لحكومة المملكة العربية السعودية</span>
        <button className="govbar__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          كيف تتحقق
          <Icon
            path={icons.chevron}
            size={13}
            strokeWidth={2}
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}
          />
        </button>
      </div>
      {open && (
        <div className="govbar__panel">
          <div className="govbar__item">
            <Icon path={icons.link} size={17} />
            <div>
              <b>روابط المواقع الإلكترونية الرسمية السعودية تنتهي بـ gov.sa</b>
              <span>
                جميع روابط المواقع الرسمية التابعة للجهات الحكومية في المملكة العربية السعودية تنتهي بـ
                .gov.sa
              </span>
            </div>
          </div>
          <div className="govbar__item">
            <Icon path={icons.lock} size={17} />
            <div>
              <b>المواقع الإلكترونية الحكومية تستخدم بروتوكول HTTPS للتشفير والأمان</b>
              <span>المواقع الإلكترونية الآمنة في المملكة العربية السعودية تستخدم بروتوكول HTTPS للتشفير.</span>
            </div>
          </div>
          <div className="govbar__license">
            <span>مسجّل لدى هيئة الحكومة الرقمية برقم:</span>
            <a href="#demo-license" onClick={(e) => e.preventDefault()}>
              — (نموذج تجريبي، لا يحمل ترخيصاً)
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
