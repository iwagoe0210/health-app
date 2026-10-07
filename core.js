"use strict";
/* ===== Núcleo: configuração, utilidades, estado e cliente da API ===== */
const CONFIG = { name: "Health", address: "Renan", persona: "descontraído" };
const AREA = {
  metas:       { label: "Metas",       color: "#fbbf24" },
  trabalho:    { label: "Carreira",    color: "#ff5547" },
  projetos:    { label: "Projetos",    color: "#8b7cff" },
  financas:    { label: "Finanças",    color: "#f7931a" },
  aprendizado: { label: "Aprendizado", color: "#2dd4ff" },
  saude:       { label: "Saúde",       color: "#10b981" },
  relacoes:    { label: "Relações",    color: "#ec4899" },
  meta:        { label: "Você",        color: "#8a90a6" }
};

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const TZ = "America/Sao_Paulo";
const fmtDT = (t) => new Date(t).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtHour = (t) => new Date(t).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayKey = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: TZ });
const todayKey = () => dayKey(Date.now());
function dayLabel(key) {
  const t = todayKey();
  const diff = Math.round((Date.parse(key + "T12:00:00Z") - Date.parse(t + "T12:00:00Z")) / 86400000);
  const d = new Date(key + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit" });
  return diff === 0 ? "HOJE · " + d : diff === 1 ? "AMANHÃ · " + d : d.toUpperCase();
}
function ago(t) {
  const m = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return "há " + m + " min";
  const h = Math.round(m / 60);
  if (h < 24) return "há " + h + " h";
  return "há " + Math.round(h / 24) + " d";
}
function inTime(t) {
  const m = Math.round((new Date(t).getTime() - Date.now()) / 60000);
  if (m <= 0) return "agora";
  if (m < 60) return "em " + m + " min";
  const h = Math.floor(m / 60);
  return "em " + h + " h" + (m % 60 ? " " + (m % 60) + " min" : "");
}
const brl = (s) => (s ? String(s) : "");

/* ===== estado ===== */
const S = {
  notes: LS.get("health_notes", []),
  rel: LS.get("health_rel", []),
  bp: LS.get("health_bp", []),
  meds: LS.get("health_meds", []),
  hist: [],
  busy: false,
  flashId: null,
  agenda: null, agendaAt: 0,
  inbox: null, inboxAt: 0,
  news: null, newsAt: 0,
  oura: null, ouraAt: 0,
  digest: null,
  model: LS.get("health_model", "claude-haiku-4-5-20251001")
};

/* ===== cliente da API (Supabase) ===== */
const CFG = window.HEALTH_CFG || null;
const API = {
  enabled: !!(CFG && CFG.url && CFG.anon),
  session: LS.get("health_session", null),
  get loggedIn() { return !!(this.session && this.session.refresh_token); },

  async login(email, password) {
    const r = await fetch(CFG.url + "/auth/v1/token?grant_type=password", {
      method: "POST", headers: { apikey: CFG.anon, "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_description || d.msg || "Login inválido.");
    this._store(d);
  },
  _store(d) {
    this.session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
    LS.set("health_session", this.session);
  },
  logout() { this.session = null; LS.del("health_session"); },
  async token() {
    if (!this.loggedIn) throw new Error("Faça login.");
    if (this.session.expires_at - Date.now() < 60000) {
      const r = await fetch(CFG.url + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST", headers: { apikey: CFG.anon, "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: this.session.refresh_token })
      });
      const d = await r.json();
      if (!r.ok) { this.logout(); throw new Error("Sessão expirada. Entre de novo."); }
      this._store(d);
    }
    return this.session.access_token;
  },
  async rest(path, opts) {
    opts = opts || {};
    const r = await fetch(CFG.url + "/rest/v1/" + path, {
      method: opts.method || "GET",
      headers: Object.assign({ apikey: CFG.anon, Authorization: "Bearer " + (await this.token()), "content-type": "application/json", Prefer: opts.prefer || "return=minimal" }, opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!r.ok) throw new Error("Banco: " + r.status + " " + (await r.text()).slice(0, 120));
    return null; // só escritas; leituras usam API.get
  },
  async get(path) {
    const r = await fetch(CFG.url + "/rest/v1/" + path, { headers: { apikey: CFG.anon, Authorization: "Bearer " + (await this.token()) } });
    if (!r.ok) throw new Error("Banco: " + r.status);
    return r.json();
  },
  async fn(path, opts) {
    opts = opts || {};
    const r = await fetch(CFG.url + "/functions/v1/api" + path, {
      method: opts.method || (opts.body ? "POST" : "GET"),
      headers: { Authorization: "Bearer " + (await this.token()), apikey: CFG.anon, "content-type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let d = null;
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((d && d.error) || "Erro " + r.status);
    return d;
  }
};
const remote = () => API.enabled && API.loggedIn;

/* ===== dados: notas, pressão, remédio (local ou Supabase) ===== */
const saveLocal = () => { LS.set("health_notes", S.notes); LS.set("health_rel", S.rel); LS.set("health_bp", S.bp); LS.set("health_meds", S.meds); };

async function loadAll() {
  if (!remote()) return;
  const [notes, rel, bp, meds] = await Promise.all([
    API.get("notes?select=*&order=title"), API.get("note_rel?select=*"),
    API.get("bp_readings?select=*&order=t.asc&limit=500"), API.get("med_logs?select=*&order=t.asc&limit=200")
  ]);
  S.notes = notes.map((n) => ({ id: n.id, area: n.area, title: n.title, body: n.body }));
  S.rel = rel.map((r) => [r.a, r.b]);
  S.bp = bp.map((r) => ({ t: Date.parse(r.t), s: r.s, d: r.d, p: r.p, n: r.n }));
  S.meds = meds.map((r) => ({ t: Date.parse(r.t) }));
}

/** Se o banco está vazio e há dados locais (fase 1), sobe tudo uma vez. */
async function migrateLocalIfEmpty() {
  if (!remote() || S.notes.length) return false;
  const ln = LS.get("health_notes", []), lr = LS.get("health_rel", []);
  if (!ln.length) return false;
  await API.rest("notes", { method: "POST", body: ln.map((n) => ({ id: n.id, area: n.area, title: n.title, body: n.body })) });
  if (lr.length) await API.rest("note_rel", { method: "POST", body: lr.map((r) => ({ a: r[0], b: r[1] })), prefer: "resolution=ignore-duplicates" });
  const lb = LS.get("health_bp", []);
  if (lb.length) await API.rest("bp_readings", { method: "POST", body: lb.map((r) => ({ t: new Date(r.t).toISOString(), s: r.s, d: r.d, p: r.p, n: r.n || "" })) });
  await loadAll();
  return true;
}

async function dbUpsertNote(n) {
  if (remote()) await API.rest("notes", { method: "POST", body: { id: n.id, area: n.area, title: n.title, body: n.body, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates" });
  else saveLocal();
}
async function dbDeleteNote(id) {
  if (remote()) {
    await API.rest("note_rel?or=(a.eq." + encodeURIComponent(id) + ",b.eq." + encodeURIComponent(id) + ")", { method: "DELETE" });
    await API.rest("notes?id=eq." + encodeURIComponent(id), { method: "DELETE" });
  } else saveLocal();
}
async function dbAddRel(a, b) {
  if (remote()) await API.rest("note_rel", { method: "POST", body: { a, b }, prefer: "resolution=ignore-duplicates" });
  else saveLocal();
}
async function dbAddBP(r) {
  if (remote()) await API.rest("bp_readings", { method: "POST", body: { t: new Date(r.t).toISOString(), s: r.s, d: r.d, p: r.p, n: r.n || "" } });
  else saveLocal();
}
async function dbAddMed(r) {
  if (remote()) await API.rest("med_logs", { method: "POST", body: { t: new Date(r.t).toISOString() } });
  else saveLocal();
}
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = "on";
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = ""), 3200);
}
