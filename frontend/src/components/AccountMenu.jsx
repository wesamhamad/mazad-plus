import { useEffect, useRef, useState } from "react";

import { api } from "../api";
import { Button, Icon, icons } from "./ui";

/**
 * قائمة الحساب — account menu in the header.
 *
 * Sign-out lives here rather than in the sidebar because the sidebar collapses
 * to a horizontal strip below 760px and drops its footer, which left the only
 * logout control unreachable on a phone.
 */
export default function AccountMenu({ user, onLogout, onUserChange }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(user.email || "");
  const [notify, setNotify] = useState(!!user.notifyEmail);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setEmail(user.email || "");
    setNotify(!!user.notifyEmail);
  }, [user.email, user.notifyEmail]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const d = await api.updateProfile({ email, notifyEmail: notify });
      onUserChange?.(d.user);
      setMsg({ tone: "ok", text: d.user.email ? "تم حفظ بريد الإشعارات" : "تمت إزالة البريد" });
    } catch (err) {
      setMsg({ tone: "err", text: err.message });
    } finally {
      setSaving(false);
    }
  };
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="accountmenu" ref={wrapRef}>
      <button
        ref={triggerRef}
        className="accountmenu__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="appheader__avatar">{user.fullName.charAt(0)}</div>
        <div className="appheader__who">
          <b>{user.fullName}</b>
          <span>{user.roleLabel}</span>
        </div>
        <Icon path={icons.chevron} size={14} className="accountmenu__caret" />
      </button>

      {open && (
        <div className="accountmenu__panel" role="menu">
          <div className="accountmenu__head">
            <b>{user.fullName}</b>
            <span>{user.roleLabel}</span>
            {user.organization && user.organization !== "—" && (
              <span>{user.organization}</span>
            )}
            <div className="accountmenu__id">
              رقم الهوية <span className="tnum">{user.nationalId}</span>
              {user.licenseNo && user.licenseNo !== "—" && ` · ${user.licenseNo}`}
            </div>
          </div>

          <form className="accountmenu__email" onSubmit={save}>
            <label htmlFor="notify-email">بريد الإشعارات</label>
            <input
              id="notify-email"
              type="email"
              inputMode="email"
              dir="ltr"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label className="accountmenu__check">
              <input
                type="checkbox"
                checked={notify}
                disabled={!email}
                onChange={(e) => setNotify(e.target.checked)}
              />
              إرسال الإشعارات على هذا البريد
            </label>
            {msg && (
              <span className={`accountmenu__msg accountmenu__msg--${msg.tone}`}>{msg.text}</span>
            )}
            <Button size="sm" block type="submit" disabled={saving}>
              {saving ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </form>

          <button
            className="accountmenu__item accountmenu__item--danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <Icon path={icons.logout} size={16} />
            تسجيل الخروج
          </button>
        </div>
      )}
    </div>
  );
}
