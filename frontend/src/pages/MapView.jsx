import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { api } from "../api";
import { Alert, Button, Card, Icon, icons, Loading, num, sar, Tag } from "../components/ui";
import AerialPhoto, { aerialFor, parcelCorners } from "../components/AerialPhoto";

/**
 * الخريطة المقارنة — a real, pannable, zoomable map.
 *
 * Tiles come from OpenStreetMap; every marker is a vector circle, so there are
 * no icon assets to bundle. Districts and auctions are drawn from the same
 * /api/map payload the previous version used — what changed is that the user
 * can now move through it: zoom into a city, pan between districts, open the
 * map to the full page, and read a side list that follows the viewport.
 *
 * The coordinates remain approximate district centroids, not surveyed parcel
 * boundaries — the map says so in its footer and tooltips.
 */

const STATUS_COLOR = {
  live: "#17B26A",
  upcoming: "#2E90FA",
  closed: "#9DA4AE",
  blocked: "#F04438",
};
const STATUS_LABEL = { live: "جارٍ", upcoming: "قادم", closed: "منتهٍ", blocked: "محجوب" };
const TIER_COLOR = { "راقٍ": "#166A45", "متوسط": "#54C08A", "اقتصادي": "#B8EACB" };

const KSA_BOUNDS = L.latLngBounds([16.0, 34.5], [32.5, 55.5]);

function popupNode(p, go) {
  p = { ...p, ...(p._prof || {}) };
  const el = document.createElement("div");
  el.className = "mappop";
  el.dir = "rtl";
  const dev = p.opportunityPct;
  const approx = p.indexQuality === "approximate";
  const devTone = dev === null || approx ? "" : dev < -15 ? "mappop__dev--good" : dev > 10 ? "mappop__dev--bad" : "";
  const approxNote = approx
    ? `<div class="mappop__nodev">≈ تقريبي: سعر مبنى مقسوم على مساحة الأرض مقابل وسيط حي مخلوط (أرض + مبنى) — لا يقارَن مثلاً بمثل.</div>`
    : "";
  const a = aerialFor({ lat: p.lat, lng: p.lng, areaSqm: p.areaSqm, seed: p.ref, width: 520, height: 300 });
  const photo = a ? `
    <div class="aerial aerial--popup">
      <img src="${p.photo || a.url}" alt="" />
      ${a.footprint ? `<svg class="aerial__footprint" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="${50 - a.footprint.w / 2}" y="${50 - a.footprint.h / 2}" width="${a.footprint.w}" height="${a.footprint.h}"
              transform="rotate(${a.footprint.rot} 50 50)" vector-effect="non-scaling-stroke"/></svg>` : ""}
      <span class="aerial__caption">صورة جوية · موقع تقريبي</span>
    </div>` : "";
  el.innerHTML = `
    ${photo}
    <div class="mappop__status" style="background:${STATUS_COLOR[p.status]}"></div>
    <b>${p.title}</b>
    <div class="mappop__sub">${p.city} · ${p.district} · ${p.subtype}</div>
    <dl>
      <dt>${p.status === "closed" ? "الترسية" : p.status === "live" ? "أعلى مزايدة" : "الافتتاح"}</dt><dd>${num(p.price)} ر.س</dd>
      ${p.pricePerSqm ? `<dt>ر.س/م²</dt><dd>${num(p.pricePerSqm)}</dd>` : ""}
      ${p.districtBenchmark ? `<dt>وسيط الحي</dt><dd>${num(p.districtBenchmark)}</dd>` : ""}
      <dt>الجاهزية</dt><dd>${p.readiness}/100</dd>
      ${p.climate ? `<dt>المناخ</dt><dd>${p.climate} · ${p.elevationM} م</dd>` : ""}
    </dl>
    ${dev !== null
      ? `<div class="mappop__dev ${devTone}">${approx ? "≈ " : ""}${dev > 0 ? "+" : ""}${dev}% عن وسيط الحي</div>${approxNote}`
      : `<div class="mappop__nodev">${p.noIndexReason || ""}</div>`}
    <div class="mappop__actions"></div>`;
  const actions = el.querySelector(".mappop__actions");
  const mk = (label, cls, fn) => {
    const b = document.createElement("button");
    b.className = cls; b.textContent = label; b.onclick = fn; actions.appendChild(b);
  };
  mk("فتح المزاد", "btn btn--primary btn--sm", () => go("auction", p.code));
  mk("كشف الأصل", "btn btn--secondary btn--sm", () => go("disclosure", p.ref));
  return el;
}

export default function MapView({ go }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [full, setFull] = useState(false);
  const [visible, setVisible] = useState([]);
  const [filters, setFilters] = useState({ status: "all", subtype: "all", budget: "", climate: "all", character: "all", minArea: "" });
  const [activeCity, setActiveCity] = useState("");

  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({ districts: null, auctions: null });
  const markersRef = useRef(new Map()); // code -> marker

  useEffect(() => {
    api.map().then(setData).catch((e) => setError(e.message));
  }, []);

  /* --------------------------------------------------------- filtering */
  const subtypes = useMemo(
    () => (data ? [...new Set(data.points.map((p) => p.subtype))].sort() : []),
    [data]
  );
  const shownPoints = useMemo(() => {
    if (!data) return [];
    const prof = (city) => data.cityProfiles?.[city];
    return data.points.filter((p) =>
      (filters.status === "all" || p.status === filters.status) &&
      (filters.subtype === "all" || p.subtype === filters.subtype) &&
      (!filters.budget || (p.price || 0) <= Number(filters.budget)) &&
      (!filters.minArea || (p.areaSqm || 0) >= Number(filters.minArea)) &&
      (filters.climate === "all" || prof(p.city)?.climate === filters.climate) &&
      (filters.character === "all" || (prof(p.city)?.character || []).includes(filters.character))
    );
  }, [data, filters]);

  /* --------------------------------------------------------- map init */
  useEffect(() => {
    if (!data || mapRef.current || !boxRef.current) return undefined;

    const map = L.map(boxRef.current, {
      zoomControl: true,
      attributionControl: true,
      maxBounds: KSA_BOUNDS.pad(0.5),
      minZoom: 5,
    });
    // Satellite is the default: an auction buyer wants to see the plot and its
    // surroundings, not a road diagram. OSM stays available for street names.
    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" }
    );
    const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, className: "osm-tiles",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    // Place labels on top of the imagery so district names stay readable.
    const labels = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, pane: "labels", attribution: "" }
    );
    map.createPane("labels").style.zIndex = 380;
    satellite.addTo(map); labels.addTo(map);
    L.control.layers(
      { "قمر صناعي": satellite, "خريطة الشوارع": streets },
      { "أسماء الأماكن": labels },
      { position: "topright", collapsed: true }
    ).addTo(map);
    map.on("baselayerchange", (e) => {
      boxRef.current?.classList.toggle("is-streets", e.name === "خريطة الشوارع");
    });

    map.createPane("parcels").style.zIndex = 390;
    map.createPane("districts").style.zIndex = 400;
    map.createPane("auctions").style.zIndex = 450;
    layersRef.current.parcels = L.layerGroup().addTo(map);
    layersRef.current.districts = L.layerGroup().addTo(map);
    layersRef.current.auctions = L.layerGroup().addTo(map);

    // Districts — small, tier-coloured, hover tooltip only.
    data.districts.filter((d) => d.lat && d.lng).forEach((d) => {
      const m = L.circleMarker([d.lat, d.lng], {
        pane: "districts",
        radius: d.landSarSqm ? 6 : 4,
        color: "#ffffff", weight: 1.5,
        fillColor: d.landSarSqm ? TIER_COLOR[d.tier] || "#54C08A" : "#D2D6DB",
        fillOpacity: 0.9,
      });
      m.bindTooltip(
        `<b>${d.name}</b> · ${d.city}<br>` +
        (d.landSarSqm ? `${num(d.landSarSqm)} ر.س/م² <span class="maptip__conf">${d.confidence === "measured" ? "مقاس" : "تقدير"}</span>`
                      : "لا وسيط منشور"),
        { direction: "top", className: "maptip", offset: [0, -4] }
      );
      layersRef.current.districts.addLayer(m);
    });

    map.fitBounds(KSA_BOUNDS, { padding: [20, 20] });
    mapRef.current = map;
    window.__mzMap = map; // dev hook: drive the map from the console / tests

    const refreshVisible = () => {
      const b = map.getBounds();
      const inView = [];
      markersRef.current.forEach((mk, code) => {
        if (mk._mzShown && b.contains(mk.getLatLng())) inView.push(mk._mzPoint);
      });
      setVisible(inView.sort((a, b) => (a.opportunityPct ?? 999) - (b.opportunityPct ?? 999)));
    };
    map.on("moveend zoomend", refreshVisible);
    map._refreshVisible = refreshVisible;
    // At parcel scale the pin is noise: the boundary IS the location.
    const syncPins = () => boxRef.current?.classList.toggle("is-parcel-zoom", map.getZoom() >= 16);
    map.on("zoomend", syncPins); syncPins();

    return () => { map.remove(); mapRef.current = null; };
  }, [data]);

  /* ------------------------------------------------- auction markers */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    const group = layersRef.current.auctions;
    const parcels = layersRef.current.parcels;
    group.clearLayers(); parcels.clearLayers();
    markersRef.current.clear();

    shownPoints.filter((p) => p.lat && p.lng).map((p) => {
      const prof = data.cityProfiles?.[p.city];
      return { ...p, _prof: prof ? { climate: prof.climate, elevationM: prof.elevationM } : {} };
    }).forEach((p) => {
      const m = L.circleMarker([p.lat, p.lng], {
        pane: "auctions",
        radius: p.status === "live" ? 10 : 8,
        color: "#ffffff", weight: 2.5,
        fillColor: STATUS_COLOR[p.status] || STATUS_COLOR.closed,
        fillOpacity: 1,
      });
      m._mzPoint = p; m._mzShown = true;
      m.bindPopup(() => popupNode(p, go), { maxWidth: 300, className: "mappop-wrap" });

      // حدود الأرض — a schematic footprint from the recorded area, drawn on the
      // map itself so the plot reads against its real surroundings when zoomed in.
      // The boundary stored by the backend: correct area, plot-like shape,
      // aligned to the nearest real street. It replaces the pin when zoomed in.
      const corners = p.parcel || parcelCorners({ lat: p.lat, lng: p.lng, areaSqm: p.areaSqm, seed: p.ref });
      if (corners) {
        const poly = L.polygon(corners, {
          pane: "parcels", className: "parcel",
          color: "#ffffff", weight: 2.5, dashArray: "8 5",
          fillColor: STATUS_COLOR[p.status] || STATUS_COLOR.closed, fillOpacity: 0.32,
        });
        poly.bindTooltip(`<b>${p.title}</b><br>${num(p.areaSqm)} م² · ${p.parcelSource || "حدود تقريبية"}`, { className: "maptip", sticky: true });
        poly.bindPopup(() => popupNode(p, go), { maxWidth: 300, className: "mappop-wrap" });
        parcels.addLayer(poly);
        m._mzPoly = poly;
      }
      m.bindTooltip(p.title, { direction: "top", className: "maptip", offset: [0, -6] });
      group.addLayer(m);
      markersRef.current.set(p.code, m);
    });
    map._refreshVisible?.();
  }, [shownPoints, data, go]);

  /* ---------------------------------------------------- city zoom */
  const flyToCity = useCallback((city) => {
    const map = mapRef.current;
    if (!map || !data) return;
    setActiveCity(city);
    if (!city) { map.flyToBounds(KSA_BOUNDS, { padding: [20, 20], duration: 0.8 }); return; }
    const pts = [
      ...data.districts.filter((d) => d.city === city && d.lat),
      ...data.points.filter((p) => p.city === city && p.lat),
    ].map((x) => [x.lat, x.lng]);
    if (pts.length) map.flyToBounds(L.latLngBounds(pts), { padding: [40, 40], duration: 0.9, maxZoom: 13 });
  }, [data]);

  const focusPoint = useCallback((p) => {
    const map = mapRef.current; const mk = markersRef.current.get(p.code);
    if (!map || !mk) return;
    map.flyTo(mk.getLatLng(), Math.max(map.getZoom(), 17), { duration: 0.7 });
    setTimeout(() => (mk._mzPoly || mk).openPopup(), 750);
  }, []);

  /* ---------------------------------------------------- fullscreen */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setTimeout(() => map.invalidateSize(), 60);
    if (!full) return undefined;
    const onKey = (e) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [full]);

  if (error) return <Alert tone="error" title="تعذّر تحميل الخريطة">{error}</Alert>;
  if (!data) return <Loading />;

  const priced = data.districts.filter((d) => d.landSarSqm);

  const legend = (
    <div className="maplegend">
      {Object.entries(STATUS_LABEL).map(([k, l]) => (
        <span key={k}><i style={{ background: STATUS_COLOR[k] }} />{l}</span>
      ))}
      <span><i className="maplegend__district" />حي بوسيط</span>
    </div>
  );

  const filterBar = (
    <div className="mapfilters">
      <select className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
        <option value="all">كل الحالات</option>
        {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <select className="input" value={filters.subtype} onChange={(e) => setFilters({ ...filters, subtype: e.target.value })}>
        <option value="all">كل الأنواع</option>
        {subtypes.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input className="input tnum" inputMode="numeric" placeholder="الميزانية القصوى"
             value={filters.budget} onChange={(e) => setFilters({ ...filters, budget: e.target.value.replace(/\D/g, "") })} />
      <input className="input tnum" inputMode="numeric" placeholder="أقل مساحة م²"
             value={filters.minArea} onChange={(e) => setFilters({ ...filters, minArea: e.target.value.replace(/\D/g, "") })} />
      <select className="input" value={filters.climate} onChange={(e) => setFilters({ ...filters, climate: e.target.value })} title="المناخ">
        <option value="all">كل المناخات</option>
        <option value="بارد">مناطق باردة</option>
        <option value="معتدل">معتدلة</option>
        <option value="حار">حارة</option>
      </select>
      <select className="input" value={filters.character} onChange={(e) => setFilters({ ...filters, character: e.target.value })} title="طابع المدينة">
        <option value="all">كل الطوابع</option>
        {[...new Set(Object.values(data.cityProfiles || {}).flatMap((c) => c.character || []))].sort().map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );

  const visibleList = (
    <div className="mapside">
      <div className="mapside__head">
        <b>في الإطار الحالي</b>
        <Tag tone="neutral"><span className="tnum">{visible.length}</span> مزاداً</Tag>
      </div>
      {visible.length === 0 ? (
        <div className="empty">حرّك الخريطة أو كبّرها لعرض المزادات في هذا الإطار</div>
      ) : (
        visible.map((p) => (
          <button className="mapside__item" key={p.code} onClick={() => focusPoint(p)}>
            <span className="mapside__thumb">
              <AerialPhoto lat={p.lat} lng={p.lng} areaSqm={p.areaSqm} seed={p.ref} height={56} caption={false} />
              <i className="mapside__dot" style={{ background: STATUS_COLOR[p.status] }} />
            </span>
            <span className="mapside__body">
              <b>{p.title}</b>
              <span>{p.city} · {p.district}</span>
              <span className="tnum">{num(p.price)} ر.س
                {p.opportunityPct !== null && (
                  <em
                    className={p.indexQuality === "approximate" ? "" : p.opportunityPct < -15 ? "good" : p.opportunityPct > 10 ? "bad" : ""}
                    title={p.indexQuality === "approximate" ? "تقريبي — مبنى مقابل وسيط حي مخلوط" : "مقارنة مباشرة"}
                  >
                    {p.indexQuality === "approximate" ? "≈ " : ""}{p.opportunityPct > 0 ? "+" : ""}{p.opportunityPct}%
                  </em>
                )}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  );

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>الخريطة المقارنة</h1>
          <p className="pagehead__sub">
            كبّر وتحرّك وتصفّح — سعر متر المزاد مقابل وسيط صفقات الحي المسجّلة
          </p>
        </div>
        <Tag tone="neutral">
          <span className="tnum">{priced.length}</span> حياً بوسيط منشور من{" "}
          <span className="tnum">{data.districts.length}</span>
        </Tag>
      </div>

      <div className={`mapstage${full ? " mapstage--full" : ""}`}>
        <div className="mapstage__bar">
          <div className="citytabs">
            <Button size="sm" variant={activeCity === "" ? "primary" : "secondary"} onClick={() => flyToCity("")}>كل المدن</Button>
            {data.cities.map((c) => (
              <Button key={c} size="sm" variant={activeCity === c ? "primary" : "secondary"} onClick={() => flyToCity(c)}>{c}</Button>
            ))}
          </div>
          {filterBar}
          <Button size="sm" variant="secondary" onClick={() => setFull((v) => !v)}>
            <Icon path={full ? icons.close : icons.grid} size={14} />
            {full ? "إغلاق (Esc)" : "ملء الشاشة"}
          </Button>
        </div>

        <div className="mapstage__body">
          <div className="mapwrap mapwrap--leaflet">
            <div ref={boxRef} className="mapcanvas" />
            {legend}
          </div>
          {visibleList}
        </div>

        <p className="note mapstage__note">{data.note}</p>
      </div>

      {!full && (
        <>
          <Alert tone="warning" title="اقرأ الانحراف بحذر">{data.caveat}</Alert>

          <div className="grid grid--split">
            <Card>
              <div className="card__head"><h3>مؤشرات السوق المنشورة</h3></div>
              <div className="card__body stack" style={{ gap: "var(--dga-space-xl)" }}>
                {data.indicators.map((m) => (
                  <div key={`${m.scope}-${m.key}`}>
                    <div className="row row--between" style={{ gap: "var(--dga-space-md)" }}>
                      <b style={{ fontSize: "var(--dga-font-size-xs)" }}>{m.label}</b>
                      <Tag tone={m.confidence === "measured" ? "success" : "warning"}>{m.scope}</Tag>
                    </div>
                    <div style={{ fontSize: "var(--dga-font-size-sm)", fontWeight: 600, margin: "3px 0" }}>{m.value}</div>
                    <div style={{ fontSize: "var(--dga-font-size-2xs)", color: "var(--text-tertiary)" }}>{m.period} · {m.source}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="card__head"><h3>أغلى الأحياء</h3></div>
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>الحي</th><th>المدينة</th><th>ر.س/م²</th></tr></thead>
                  <tbody>
                    {[...priced].sort((a, b) => b.landSarSqm - a.landSarSqm).slice(0, 8).map((d) => (
                      <tr key={d.id} style={{ cursor: "pointer" }}
                          onClick={() => { flyToCity(d.city); setTimeout(() => mapRef.current?.flyTo([d.lat, d.lng], 14), 950); }}>
                        <td><strong>{d.name}</strong></td>
                        <td>{d.city}</td>
                        <td className="tnum">{num(d.landSarSqm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
