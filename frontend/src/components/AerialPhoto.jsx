/**
 * صورة جوية للموقع — an aerial "photo" derived from the asset's coordinates.
 *
 * There are no photographs of these demo assets, and inventing them would be
 * worse than none. What we do have is the coordinate, so the image is real
 * satellite imagery (Esri World Imagery, no key required) exported around it,
 * with the parcel footprint drawn on top — sized from the recorded area.
 *
 * Because coordinates are district centroids rather than surveyed parcels,
 * every instance carries the caption "موقع تقريبي" and the footprint is a
 * schematic, not a cadastral boundary.
 */
const ESRI_EXPORT = "https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export";

const M_PER_DEG_LAT = 111_320;

function hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Build the export URL and the footprint geometry for one asset. */
export function aerialFor({ lat, lng, areaSqm, seed = "", width = 480, height = 300 }) {
  if (!lat || !lng) return null;
  const side = areaSqm ? Math.sqrt(areaSqm) : 0;               // parcel edge, metres
  const windowM = Math.max(160, side * 3.2);                    // what the photo shows
  const halfLat = (windowM / 2) / M_PER_DEG_LAT;
  const halfLng = (windowM / 2) / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const aspect = width / height;
  const bbox = [lng - halfLng * aspect, lat - halfLat, lng + halfLng * aspect, lat + halfLat].join(",");
  const url = `${ESRI_EXPORT}?bbox=${bbox}&bboxSR=4326&imageSR=3857&size=${width},${height}&format=jpg&f=image`;

  // footprint as a % of the frame, slightly rotated so it reads as a parcel
  const fracH = side ? side / windowM : 0;
  const fracW = fracH / aspect;
  const rot = ((hash(seed) % 25) - 12) * (side ? 1 : 0);          // −12° … +12°
  return { url, footprint: side ? { w: fracW * 100, h: fracH * 100, rot } : null };
}

/**
 * Parcel corners as [lat, lng] pairs — a schematic square footprint of the
 * recorded area, rotated deterministically, centred on the asset coordinate.
 * Schematic: the deed gives boundary lengths, not a surveyed polygon.
 */
export function parcelCorners({ lat, lng, areaSqm, seed = "" }) {
  if (!lat || !lng || !areaSqm) return null;
  const half = Math.sqrt(areaSqm) / 2;                                  // metres
  const rot = (((hash(seed) % 25) - 12) * Math.PI) / 180;
  const mLat = M_PER_DEG_LAT, mLng = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  return [[-half, -half], [half, -half], [half, half], [-half, half]].map(([x, y]) => {
    const rx = x * Math.cos(rot) - y * Math.sin(rot);
    const ry = x * Math.sin(rot) + y * Math.cos(rot);
    return [lat + ry / mLat, lng + rx / mLng];
  });
}

/** Google Street View at the coordinate — real street imagery, no key needed. */
export const streetViewUrl = (lat, lng) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;

export default function AerialPhoto({ lat, lng, areaSqm, seed, height = 200, caption = true, className = "" }) {
  const a = aerialFor({ lat, lng, areaSqm, seed });
  if (!a) {
    return (
      <div className={`aerial aerial--empty ${className}`} style={{ height }}>
        <span>لا إحداثيات مسجّلة لهذا الأصل</span>
      </div>
    );
  }
  return (
    <div className={`aerial ${className}`} style={{ height }}>
      <img src={a.url} alt="صورة جوية للموقع" loading="lazy" />
      {a.footprint && (
        <svg className="aerial__footprint" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <rect
            x={50 - a.footprint.w / 2} y={50 - a.footprint.h / 2}
            width={a.footprint.w} height={a.footprint.h}
            transform={`rotate(${a.footprint.rot} 50 50)`}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      {caption && <span className="aerial__caption">صورة جوية · موقع تقريبي</span>}
    </div>
  );
}
