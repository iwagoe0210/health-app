"use strict";
/* ===== Notícias por assunto + Digest da manhã + notificações ===== */
async function loadNews(force) {
  if (!remote()) return null;
  if (!force && S.news && Date.now() - S.newsAt < 30 * 60000) return S.news;
  S.news = await API.fn("/news" + (force ? "?force=1" : ""));
  S.newsAt = Date.now();
  return S.news;
}
function renderNews() {
  const box = $("#newsBox");
  if (!remote()) { box.innerHTML = '<div class="card"><div class="mut">As notícias aparecem depois de ativar o servidor (Config).</div></div>'; return; }
  if (!S.news) { box.innerHTML = '<div class="mut">Carregando...</div>'; return; }
  box.innerHTML = S.news.map((t) => '<h2>' + esc(t.topic) + "</h2>" + (t.items.length ? '<div class="card">' + t.items.map((i) =>
    '<a class="item news" href="' + esc(i.link) + '" target="_blank" rel="noopener"><div style="flex:1;min-width:0"><div class="ttl">' + esc(i.title) + '</div><div class="mut small2">' + esc(i.source) + (i.ts ? " · " + ago(i.ts) : "") + "</div></div></a>").join("") + "</div>" : '<div class="card"><div class="mut">Sem manchetes agora.</div></div>')).join("");
}
async function refreshNews(force) {
  try { await loadNews(force); } catch (e) { S.news = []; toast(e.message); }
  renderNews();
}
async function newsAnswer(topicWords) {
  const n = await loadNews(false).catch(() => null);
  if (!n) return "Não consegui buscar as notícias agora.";
  let list = n;
  if (topicWords) {
    const w = norm(topicWords);
    const hit = n.filter((t) => norm(t.topic).includes(w) || w.includes(norm(t.topic).split(" ")[0]));
    if (hit.length) list = hit;
  }
  const out = list.filter((t) => t.items.length).slice(0, topicWords ? 1 : 4).map((t) => t.topic + ": " + t.items.slice(0, topicWords ? 4 : 1).map((i) => i.title).join(". "));
  return out.length ? out.join(". ") + "." : "Sem manchetes novas agora.";
}

/* ---------- Digest ---------- */
async function loadDigest(force) {
  if (!remote()) return null;
  if (force) S.digest = await API.fn("/digest", { body: { force: true, notify: false } });
  else if (!S.digest) S.digest = await API.fn("/digest/latest");
  return S.digest;
}
function renderDigest() {
  const box = $("#digestText");
  if (!remote()) { box.textContent = "O briefing da manhã precisa do servidor ativado (Config)."; return; }
  const d = S.digest;
  box.textContent = d && d.text ? d.text : "Ainda sem briefing hoje. Toque em “Gerar agora”.";
  $("#digestDay").textContent = d && d.day ? "Briefing de " + d.day.split("-").reverse().join("/") : "";
}
async function digestAnswer(force) {
  try {
    const d = await API.fn("/digest", { body: { force: !!force, notify: false } });
    S.digest = d; LS.set("health_last_digest", todayKey()); renderDigest();
    return d.text;
  } catch (e) { return "Não consegui montar o briefing agora: " + e.message; }
}
async function autoDigestOncePerDay() {
  if (!remote() || LS.get("health_last_digest", "") === todayKey()) return false;
  LS.set("health_last_digest", todayKey());
  const t = await digestAnswer(false);
  setReply(t); speak(t);
  return true;
}

/* ---------- Notificações push ---------- */
function b64ToU8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4), s = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function enablePush() {
  if (!remote()) return toast("Ative o servidor primeiro.");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return toast("Este navegador não suporta notificações. Instale o app pelo Chrome.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return toast("Notificações bloqueadas. Libere nas permissões do site.");
  const reg = await navigator.serviceWorker.ready;
  const key = (await API.fn("/push/key")).key;
  if (!key) return toast("O servidor ainda não tem a chave de notificações.");
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) }));
  await API.fn("/push/subscribe", { body: sub.toJSON() });
  toast("Notificações ativadas.");
}
