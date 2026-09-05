/**
 * عميل الواجهة البرمجية — Mazad+ API client.
 *
 * One place that knows about the token, the base path, and how the backend
 * reports errors, so no component has to.
 */

const TOKEN_KEY = "mazadplus.token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    // The backend always sends a human-readable Arabic `message`; fall back to
    // something honest rather than leaking a status code at the user.
    throw new ApiError(
      payload?.message || "تعذّر إتمام الطلب — تحقّق من اتصال الخادم",
      res.status,
      payload?.error
    );
  }
  return payload;
}

export const api = {
  // auth
  demoIdentities: () => request("/auth/demo-identities"),
  publicStats: () => request("/public-stats"),
  nafathInitiate: (nationalId) =>
    request("/auth/nafath/initiate", { method: "POST", body: { nationalId } }),
  nafathVerify: (requestId, selected) =>
    request("/auth/nafath/verify", { method: "POST", body: { requestId, selected } }),
  me: () => request("/auth/me"),
  updateProfile: (body) => request("/auth/profile", { method: "PUT", body }),
  logout: () => request("/auth/logout", { method: "POST" }),

  // data
  dashboard: () => request("/dashboard"),
  auctions: (status) => request(`/auctions${status && status !== "all" ? `?status=${status}` : ""}`),
  auction: (code) => request(`/auctions/${code}`),
  placeBid: (code, amount) => request(`/auctions/${code}/bids`, { method: "POST", body: { amount } }),
  acceptDeposit: (code) => request(`/auctions/${code}/deposit/accept`, { method: "POST" }),

  properties: () => request("/properties"),
  property: (ref) => request(`/properties/${ref}`),
  toggleDocument: (ref, docId) =>
    request(`/properties/${ref}/documents/${docId}/toggle`, { method: "POST" }),
  priceDecision: (ref, payload) =>
    request(`/properties/${ref}/pricing/decision`, { method: "POST", body: payload }),

  fraudAlerts: () => request("/fraud-alerts"),
  alertDecision: (code, state) =>
    request(`/fraud-alerts/${code}/decision`, { method: "POST", body: { state } }),

  settings: () => request("/settings"),
  updateSetting: (key, value) => request(`/settings/${key}`, { method: "PUT", body: { value } }),

  audit: (limit = 120) => request(`/audit?limit=${limit}`),
  valueMatrix: () => request("/value-matrix"),

  // صور الأصل — multipart, so it bypasses the JSON helper
  uploadPhotos: async (ref, files, caption) => {
    const fd = new FormData();
    [...files].forEach((f) => fd.append("photos", f));
    if (caption) fd.append("caption", caption);
    const res = await fetch(`/api/properties/${ref}/photos`, {
      method: "POST", body: fd, headers: { Authorization: `Bearer ${getToken()}` },
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(payload?.message || "تعذّر رفع الصور", res.status, payload?.error);
    return payload;
  },
  deletePhoto: (ref, id) => request(`/properties/${ref}/photos/${id}`, { method: "DELETE" }),

  similar: (ref) => request(`/properties/${ref}/similar`),
  inquiry: (query) => request("/inquiry", { method: "POST", body: { query } }),
  plans: () => request("/plans"),

  // الخدمة ١ — كشف الأصل
  registryInfo: () => request("/registry"),
  disclosure: (ref) => request(`/properties/${ref}/disclosure`),
  issueDisclosure: (ref) => request(`/properties/${ref}/disclosure/issue`, { method: "POST" }),
  // الخدمة ٢ — الخريطة
  map: (city) => request(`/map${city ? `?city=${encodeURIComponent(city)}` : ""}`),
  // الخدمة ٣ — التقارير
  reports: () => request("/reports"),
  report: (code) => request(`/reports/${code}`),
  issueClosing: (code) => request(`/auctions/${code}/closing-report`, { method: "POST" }),
  notifications: () => request("/notifications"),
};

/** Subscribe to the live bid stream (Server-Sent Events). */
export function subscribeToAuction(code, handlers = {}) {
  const source = new EventSource(`/api/auctions/${code}/stream`);
  if (handlers.onBid) source.addEventListener("bid", (e) => handlers.onBid(JSON.parse(e.data)));
  if (handlers.onClosed) source.addEventListener("closed", (e) => handlers.onClosed(JSON.parse(e.data)));
  return () => source.close();
}
