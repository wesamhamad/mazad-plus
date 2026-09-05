import { useEffect, useRef, useState } from "react";

import { api } from "../api";
import { Button, Icon, icons, Tag } from "./ui";
import { streetViewUrl } from "./AerialPhoto";

/**
 * معرض صور الأصل — main image, thumbnails, lightbox, and (for agents) upload.
 *
 * Aerial captures and uploaded inspection photographs are kept visually
 * distinct: the kind badge is on every image, because a satellite crop of a
 * district centroid is evidence of the surroundings, not of the asset.
 */
const KIND = { aerial: { label: "صورة جوية", tone: "info" }, inspection: { label: "صورة معاينة", tone: "success" } };

export default function PhotoGallery({ property, canEdit, onChange }) {
  const photos = property.photos || [];
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef(null);
  const current = photos[Math.min(active, photos.length - 1)];

  useEffect(() => { if (active >= photos.length) setActive(0); }, [photos.length, active]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowLeft") setActive((i) => (i + 1) % photos.length);
      if (e.key === "ArrowRight") setActive((i) => (i - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);

  async function upload(files) {
    if (!files?.length) return;
    setBusy(true); setErr("");
    try {
      const res = await api.uploadPhotos(property.ref, files);
      onChange?.(res.photos);
      setActive(res.photos.length - 1);
    } catch (e) { setErr(e.message); } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }
  async function remove(ph) {
    if (!window.confirm("حذف هذه الصورة؟")) return;
    setBusy(true);
    try { const res = await api.deletePhoto(property.ref, ph.id); onChange?.(res.photos); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="gallery">
      {current ? (
        <button className="gallery__main" onClick={() => setOpen(true)} aria-label="تكبير الصورة">
          <img src={current.url} alt={current.caption || ""} />
          <span className="gallery__badge"><Tag tone={KIND[current.kind]?.tone || "neutral"}>{KIND[current.kind]?.label || current.kind}</Tag></span>
          {current.caption && <span className="gallery__caption">{current.caption}</span>}
        </button>
      ) : (
        <div className="gallery__main gallery__main--empty">لا صور لهذا الأصل بعد</div>
      )}

      {photos.length > 1 && (
        <div className="gallery__thumbs">
          {photos.map((ph, i) => (
            <button key={ph.id} className={`gallery__thumb${i === active ? " is-active" : ""}`} onClick={() => setActive(i)}>
              <img src={ph.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <div className="gallery__bar">
        {property.lat && (
          <a className="btn btn--secondary btn--sm" href={streetViewUrl(property.lat, property.lng)} target="_blank" rel="noreferrer">
            <Icon path={icons.globe} size={14} /> عرض الشارع (خرائط جوجل)
          </a>
        )}
        {canEdit && (
          <>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
                   onChange={(e) => upload(e.target.files)} />
            <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Icon path={icons.spark} size={14} /> {busy ? "جارٍ الرفع…" : "رفع صور معاينة"}
            </Button>
            {current?.kind === "inspection" && (
              <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(current)}>حذف</Button>
            )}
          </>
        )}
      </div>
      {err && <p className="field__error">{err}</p>}
      <p className="note">
        الصور الجوية التقاط قمر صناعي حقيقي حول الإحداثيات المسجّلة (موقع تقريبي — مركز الحي). صور
        المعاينة يرفعها وكيل البيع من ملف المعاينة، وتُسجَّل باسمه في سجل التدقيق.
      </p>

      {open && current && (
        <div className="lightbox" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)} role="dialog" aria-modal="true">
          <button className="lightbox__close" onClick={() => setOpen(false)} aria-label="إغلاق"><Icon path={icons.close} size={18} /></button>
          {photos.length > 1 && (
            <>
              <button className="lightbox__nav lightbox__nav--prev" onClick={() => setActive((i) => (i - 1 + photos.length) % photos.length)}>‹</button>
              <button className="lightbox__nav lightbox__nav--next" onClick={() => setActive((i) => (i + 1) % photos.length)}>›</button>
            </>
          )}
          <img src={current.url} alt={current.caption || ""} />
          <div className="lightbox__caption">{KIND[current.kind]?.label} · {current.caption} · {active + 1}/{photos.length}</div>
        </div>
      )}
    </div>
  );
}
