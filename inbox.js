"use strict";
/* ===== Caixa: e-mails em 4 baldes (Ação, Contas, Info, Ruído) ===== */
async function loadInbox(force) {
  if (!remote()) return null;
  if (!force && S.inbox && Date.now() - S.inboxAt < 5 * 60000) return S.inbox;
  S.inbox = force ? await API.fn("/inbox/sync", { method: "POST" }) : await API.fn("/inbox");
  S.inboxAt = Date.now();
  updateBadge();
  return S.inbox;
}
const accOf = (id) => ((S.inbox && S.inbox.accounts) || []).find((a) => a.id === id) || { label: "", color: "#8a90a6" };
function dueInfo(due) {
  if (!due) return { txt: "sem data", cor: "var(--mut)", n: null };
  const n = Math.round((Date.parse(due + "T12:00:00Z") - Date.parse(todayKey() + "T12:00:00Z")) / 86400000);
  if (n < 0) return { txt: "ATRASADA " + (-n) + " d", cor: "var(--bad)", n };
  if (n === 0) return { txt: "VENCE HOJE", cor: "var(--bad)", n };
  if (n <= 3) return { txt: "em " + n + " d", cor: "var(--warn)", n };
  return { txt: "em " + n + " d", cor: "var(--mut)", n };
}
function mailItem(m, opts) {
  const a = accOf(m.account_id);
  const d = opts && opts.bill ? dueInfo(m.due) : null;
  return '<div class="item mail" data-id="' + esc(m.id) + '"><span class="dot" style="background:' + esc(a.color) + '"></span>' +
    '<div style="flex:1;min-width:0"><div class="ttl">' + esc(opts && opts.bill ? (m.issuer || m.from_name) : m.from_name) + (m.unread ? ' <span class="new">novo</span>' : "") + "</div>" +
    '<div class="mut">' + esc(m.summary || m.subject) + "</div>" +
    '<div class="mut small2">' + esc(a.label) + " · " + ago(m.received_at) + (m.triage === "local" ? " · triagem local" : "") + "</div>" +
    '<div class="snip hide">' + esc(m.subject) + "<br>" + esc(m.snippet) + "</div></div>" +
    (d ? '<div class="bill"><div class="amt">' + esc(m.amount || "—") + '</div><span class="tag" style="color:' + d.cor + ';border-color:' + d.cor + '">' + d.txt + "</span></div>" : "") +
    (opts && opts.done ? '<button class="small ok" data-done="' + esc(m.id) + '" aria-label="Marcar como resolvido">✓</button>' : "") + "</div>";
}
function renderInbox() {
  const box = $("#inboxBox");
  if (!remote()) { box.innerHTML = '<div class="card"><div class="mut">A caixa de e-mails aparece depois de ativar o servidor e conectar suas contas Google (Config).</div></div>'; return; }
  const d = S.inbox;
  if (!d) { box.innerHTML = '<div class="mut">Carregando...</div>'; return; }
  const rec = d.recent.filter((m) => !m.done);
  const sec = (title, list, opts, collapsed) => '<h2>' + title + " (" + list.length + ")</h2>" + (list.length ? '<div class="card' + (collapsed ? " hide" : "") + '" data-sec>' + list.map((m) => mailItem(m, opts)).join("") + "</div>" : '<div class="card"><div class="mut">Nada por aqui.</div></div>');
  const acao = rec.filter((m) => m.bucket === "acao");
  const info = rec.filter((m) => m.bucket === "info");
  const ruido = rec.filter((m) => m.bucket === "ruido");
  let html = "";
  if (d.errors && d.errors.length) html += '<div class="card warn">⚠ ' + d.errors.map(esc).join("<br>") + "</div>";
  if (!d.accounts.length) html += '<div class="card"><div class="mut">Nenhuma conta Google conectada. Vá em Config → Contas Google.</div></div>';
  html += sec("⚡ AÇÃO", acao, { done: true });
  html += sec("💳 CONTAS A PAGAR", d.bills, { bill: true, done: true });
  html += sec("ℹ️ INFO", info, {});
  html += '<h2 id="ruidoH" style="cursor:pointer">🔇 RUÍDO (' + ruido.length + ') ▾</h2>' + (ruido.length ? '<div class="card hide" id="ruidoBox">' + ruido.map((m) => mailItem(m, {})).join("") + "</div>" : "");
  box.innerHTML = html;
  $$(".mail", box).forEach((el) => el.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-done]")) return;
    el.querySelector(".snip").classList.toggle("hide");
  }));
  $$("[data-done]", box).forEach((b) => b.addEventListener("click", async () => {
    try { await API.fn("/inbox/done", { body: { id: b.dataset.done, done: true } }); toast("Marcado como resolvido."); await refreshInbox(false, true); } catch (e) { toast(e.message); }
  }));
  const rh = $("#ruidoH", box);
  if (rh) rh.onclick = () => { const r = $("#ruidoBox"); if (r) r.classList.toggle("hide"); };
}
async function refreshInbox(force, silent) {
  if (!remote()) return renderInbox();
  try { await loadInbox(force); } catch (e) { S.inbox = { recent: [], bills: [], accounts: [], errors: [e.message] }; }
  renderInbox();
}
function badgeCount() {
  const d = S.inbox;
  if (!d) return 0;
  const a = d.recent.filter((m) => m.bucket === "acao" && !m.done).length;
  const c = d.bills.filter((m) => { const x = dueInfo(m.due); return x.n !== null && x.n <= 0; }).length;
  return a + c;
}
function updateBadge() {
  const n = badgeCount(), b = $("#navBadge");
  if (!b) return;
  b.textContent = n; b.classList.toggle("hide", !n);
}

/* ---------- respostas por voz ---------- */
async function inboxAnswer(kind) {
  const d = await loadInbox(false).catch(() => null);
  if (!d) return "Não consegui ler seus e-mails agora.";
  const rec = d.recent.filter((m) => !m.done);
  const acao = rec.filter((m) => m.bucket === "acao");
  if (kind === "importante") {
    if (!acao.length) return "Nenhum e-mail pedindo ação agora. Tá tranquilo!";
    return "Tem " + acao.length + " pedindo ação: " + acao.slice(0, 4).map((m) => m.from_name + ", " + (m.summary || m.subject)).join("; ") + ".";
  }
  const c = d.bills.length;
  let msg = "Você tem " + acao.length + " e-mail" + (acao.length === 1 ? "" : "s") + " pedindo ação, " + (function (n) { return n + (n === 1 ? " informativo" : " informativos"); })(rec.filter((m) => m.bucket === "info").length) + " e " + c + " conta" + (c === 1 ? "" : "s") + " a pagar.";
  if (acao.length) msg += " Os principais: " + acao.slice(0, 3).map((m) => m.from_name + ", " + (m.summary || m.subject)).join("; ") + ".";
  return msg;
}
async function billsAnswer() {
  const d = await loadInbox(false).catch(() => null);
  if (!d) return "Não consegui ler seus e-mails agora.";
  if (!d.bills.length) return "Não achei nenhuma conta pendente nos seus e-mails.";
  const l = d.bills.slice(0, 5).map((b) => { const x = dueInfo(b.due); return (b.issuer || b.from_name) + " " + (b.amount || "") + ", " + x.txt.toLowerCase(); });
  return "Contas pendentes: " + l.join("; ") + ".";
}
