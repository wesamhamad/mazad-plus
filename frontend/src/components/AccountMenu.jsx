import { useEffect, useRef, useState } from "react";

import { Icon, icons } from "./ui";

/**
 * قائمة الحساب — account menu in the header.
 *
 * Sign-out lives here rather than in the sidebar because the sidebar collapses
 * to a horizontal strip below 760px and drops its footer, which left the only
 * logout control unreachable on a phone.
 */
export default function AccountMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
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
