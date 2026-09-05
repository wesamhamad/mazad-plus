/**
 * شاشة الدخول — Mazad+ sign-in, with the Nafath flow as the primary path.
 *
 * The Nafath step is a REPLICA, and the page says so where it matters rather
 * than behind a banner across the top: on the brand panel, and inside the
 * dialog itself at the moment an ID is being entered. The real integration is
 * not something a demo can stand in for — it needs an application, an
 * integration agreement, and prior approval from the National Information
 * Center. Matching an ID here queries this project's own SQLite table, and
 * nothing leaves the machine.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { api, setToken } from "../api";
import { Alert, Button, Icon, icons } from "../components/ui";

const REQUEST_TTL = 120;

const HIGHLIGHTS = [
  {
    icon: icons.building,
    title: "بطاقة أصل موحّدة ودرجة جاهزية",
    body: "تمنع طرح الأصول ناقصة المستندات قبل وصولها للمزاد",
  },
  {
    icon: icons.gavel,
    title: "تسعير مفسَّر واحتمالية ترسية",
    body: "مبني على المزادات المنتهية داخل المنصة، بمراجعة مُقيّم إلزامية",
  },
  {
    icon: icons.shield,
    title: "رصد النجش والتواطؤ",
    body: "تنبيهات للمشرف — ولا حظر آلي لأي مزايد",
  },
];

export default function NafathLogin({ onAuthenticated, theme, onToggleTheme }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("id");
  const [nationalId, setNationalId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null);
  const [identities, setIdentities] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(REQUEST_TTL);
  const [stats, setStats] = useState(null);
  const idRef = useRef(null);

  useEffect(() => {
    api.demoIdentities().then((d) => setIdentities(d.identities)).catch(() => {});
    api.publicStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    if (open && step === "id") setTimeout(() => idRef.current?.focus(), 120);
  }, [open, step]);

  useEffect(() => {
    if (step !== "confirm") return undefined;
    setSecondsLeft(REQUEST_TTL);
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          setStep("id");
          setError("انتهت صلاحية الطلب — أعد المحاولة");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  // Escape closes the dialog, as a dialog should.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && closeDialog();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const idValid = useMemo(() => /^[12]\d{9}$/.test(nationalId), [nationalId]);

  function closeDialog() {
    setOpen(false);
    setStep("id");
    setError("");
    setSession(null);
  }

  async function submitId(event) {
    event?.preventDefault();
    if (!idValid) {
      setError("رقم الهوية يجب أن يتكوّن من 10 أرقام ويبدأ بـ 1 (مواطن) أو 2 (مقيم)");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setSession(await api.nafathInitiate(nationalId));
      setStep("confirm");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(selected) {
    setBusy(true);
    setError("");
    try {
      const data = await api.nafathVerify(session.requestId, selected);
      setToken(data.token);
      setStep("done");
      setTimeout(() => onAuthenticated(data.user), 900);
    } catch (err) {
      setError(err.message);
      setStep("id");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      {/* ------------------------------------------------------- form side */}
      <div className="auth__main">
        <div className="auth__top">
          <div className="auth__brand">
            <div className="auth__brand-mark">+م</div>
            <div className="auth__brand-text">
              <b>مزاد+</b>
              <span>منصة المزادات العقارية المتخصصة</span>
            </div>
          </div>
          <div className="auth__top-actions">
            <button className="auth__icon-btn" onClick={onToggleTheme}>
              <Icon path={theme === "dark" ? icons.sun : icons.moon} size={14} />
              {theme === "dark" ? "فاتح" : "داكن"}
            </button>
            <button className="auth__icon-btn" type="button">
              <Icon path={icons.globe} size={14} />
              English
            </button>
          </div>
        </div>

        <div className="auth__body">
          <div className="auth__form">
            <div className="auth__card">
              <h2 className="auth__card-title">الدخول إلى مزاد+</h2>
              <p className="auth__card-sub">
                الدخول يتم حصراً عبر النفاذ الوطني الموحد — لا كلمات مرور ولا حسابات منفصلة.
                حسابات وكلاء البيع والمُقيّمين تُفعَّل بعد التحقق من الهوية ومن رخصة فال.
              </p>

              <button className="auth__nafath" onClick={() => setOpen(true)}>
                <span className="auth__nafath-mark">نفاذ</span>
                الدخول عبر النفاذ الوطني الموحد
              </button>

              <p
                style={{
                  marginTop: "var(--dga-space-lg)",
                  fontSize: "var(--dga-font-size-2xs)",
                  color: "var(--text-tertiary)",
                  textAlign: "center",
                  lineHeight: 1.7,
                }}
              >
                بعد الدخول يمكنك إضافة بريد إلكتروني لتلقي الإشعارات من قائمة الحساب.
              </p>
            </div>
          </div>
        </div>

        <div className="auth__foot">
          <span>© 2026 مزاد+ — نموذج تجريبي</span>
          <span>تصميم متوافق مع كود المنصات · هيئة الحكومة الرقمية</span>
        </div>
      </div>

      {/* ----------------------------------------------------- brand panel */}
      <aside className="auth__aside">
        <span className="auth__aside-kicker">
          <Icon path={icons.gavel} size={13} />
          ضمن منظومة إنفاذ للبيع والتصفية
        </span>

        <div>
          <h2>طبقة الجاهزية والتسعير التي تسبق المزاد</h2>
          <p>
            مزاد+ لا ينافس المنصات المعتمدة — يخدمها جميعاً. يحوّل مستندات المعاينة إلى بطاقة
            أصل موحّدة، ويمنع طرح الناقص، ويوصي بسعر افتتاح مفسَّر بمراجعة بشرية إلزامية.
          </p>
        </div>

        <div className="auth__features">
          {HIGHLIGHTS.map((f) => (
            <div className="auth__feature" key={f.title}>
              <span className="auth__feature-icon">
                <Icon path={f.icon} size={16} />
              </span>
              <div>
                <b>{f.title}</b>
                <span>{f.body}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="auth__stats">
          <div className="auth__stat">
            <b>{stats ? stats.assets : "—"}</b>
            <span>أصلاً في المنصة</span>
          </div>
          <div className="auth__stat">
            <b>{stats ? stats.auctions : "—"}</b>
            <span>مزاداً</span>
          </div>
          <div className="auth__stat">
            <b>{stats ? stats.bids : "—"}</b>
            <span>مزايدة مسجّلة</span>
          </div>
        </div>

        <div className="auth__demo-note">
          <Icon path={icons.alert} size={15} style={{ flex: "none", marginTop: 1 }} />
          <div>
            <b>نموذج تجريبي</b>
            شاشة نفاذ هنا محاكاة للواجهة الرسمية لأغراض العرض. الربط الحقيقي يتطلب اتفاقية ربط
            وموافقة مسبقة من مركز المعلومات الوطني. لا تُدخل بيانات حقيقية.
          </div>
        </div>
      </aside>

      {/* --------------------------------------------------- Nafath dialog */}
      {open && (
        <div
          className="nfx__backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="الدخول عبر النفاذ الوطني الموحد"
          onMouseDown={(e) => e.target === e.currentTarget && closeDialog()}
        >
          <div className="nfx">
            <div className="nfx__head">
              <div className="nfx__logo">نفاذ</div>
              <div>
                <b>النفاذ الوطني الموحد</b>
                <span>محاكاة تجريبية · مزاد+</span>
              </div>
              <button className="nfx__close" onClick={closeDialog} aria-label="إغلاق">
                <Icon path={icons.close} size={15} strokeWidth={2.2} />
              </button>
            </div>

            <div className="nfx__steps" aria-hidden="true">
              {["id", "confirm", "done"].map((s, i) => (
                <span
                  key={s}
                  className={`nfx__step${["id", "confirm", "done"].indexOf(step) >= i ? " nfx__step--on" : ""}`}
                />
              ))}
            </div>

            <div className="nfx__body">
              {step === "id" && (
                <form onSubmit={submitId}>
                  <h2 className="nfx__title">أدخل رقم الهوية</h2>
                  <p className="nfx__sub">
                    سيصلك إشعار على تطبيق نفاذ لتأكيد الدخول
                  </p>

                  <div style={{ margin: "var(--dga-space-2xl) 0 var(--dga-space-lg)" }}>
                    <input
                      ref={idRef}
                      className={`input nfx__idinput${error ? " input--error" : ""}`}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={10}
                      placeholder="1XXXXXXXXX"
                      aria-label="رقم الهوية الوطنية أو الإقامة"
                      value={nationalId}
                      onChange={(e) => {
                        setNationalId(e.target.value.replace(/\D/g, "").slice(0, 10));
                        setError("");
                      }}
                    />
                    {error ? (
                      <p className="field__error">
                        <Icon path={icons.alert} size={13} strokeWidth={2} />
                        {error}
                      </p>
                    ) : (
                      <p className="field__hint">10 أرقام — تبدأ بـ 1 للمواطن أو 2 للمقيم</p>
                    )}
                  </div>

                  <Button type="submit" block size="lg" disabled={!idValid || busy}>
                    {busy ? "جارٍ الإرسال…" : "متابعة"}
                  </Button>

                  {identities.length > 0 && (
                    <div style={{ marginTop: "var(--dga-space-2xl)" }}>
                      <p className="field__hint" style={{ marginBottom: "var(--dga-space-md)" }}>
                        هويات تجريبية مسجّلة في قاعدة بيانات المشروع:
                      </p>
                      <div className="nfx__identities">
                        {identities.map((identity) => (
                          <button
                            type="button"
                            key={identity.nationalId}
                            className="nfx__identity"
                            onClick={() => {
                              setNationalId(identity.nationalId);
                              setError("");
                            }}
                          >
                            <span>
                              <span className="nfx__identity-id">{identity.nationalId}</span>
                              <span className="nfx__identity-name"> · {identity.fullName}</span>
                            </span>
                            <span className="nfx__identity-role">{identity.roleLabel}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </form>
              )}

              {step === "confirm" && (
                <div style={{ textAlign: "center" }}>
                  <h2 className="nfx__title">افتح تطبيق نفاذ واختر الرقم</h2>
                  <p className="nfx__sub">أُرسل إشعار إلى الجهاز المسجّل {session?.maskedPhone}</p>

                  <div className="nfx__code">{session?.code}</div>

                  <p className="nfx__sub" style={{ marginBottom: "var(--dga-space-xl)" }}>
                    اختر الرقم نفسه أدناه لمحاكاة التأكيد من التطبيق
                  </p>
                  <div className="nfx__options">
                    {session?.options?.map((option) => (
                      <button
                        key={option}
                        className="nfx__option"
                        disabled={busy}
                        onClick={() => confirm(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>

                  <p className="nfx__timer">
                    تنتهي صلاحية الطلب خلال{" "}
                    <span className="tnum">
                      {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:
                      {String(secondsLeft % 60).padStart(2, "0")}
                    </span>
                  </p>

                  <div style={{ marginTop: "var(--dga-space-lg)" }}>
                    <Button variant="ghost" block onClick={() => setStep("id")}>
                      رجوع
                    </Button>
                  </div>
                </div>
              )}

              {step === "done" && (
                <div style={{ textAlign: "center", padding: "var(--dga-space-xl) 0" }}>
                  <div className="nfx__success">
                    <Icon path={icons.check} size={28} strokeWidth={2.5} />
                  </div>
                  <h2 className="nfx__title">تم التحقق من الهوية</h2>
                  <p className="nfx__sub">جارٍ تحويلك إلى منصة مزاد+…</p>
                </div>
              )}
            </div>

            <div className="nfx__foot">
              <b>محاكاة — ليست نفاذ الحقيقي.</b>
              المطابقة تتم مع جدول المستخدمين في قاعدة بيانات هذا المشروع على جهازك، ولا تُرسل
              أي بيانات إلى أي جهة خارجية.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
