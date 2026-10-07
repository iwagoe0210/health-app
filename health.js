"use strict";
/* ===== Saúde: pressão, remédio e Oura ===== */
function classifyBP(s, d) {
  if (s >= 180 || d >= 120) return { k: "crise", cor: "var(--bad)", txt: "muito alta" };
  if (s >= 140 || d >= 90) return { k: "alta", cor: "var(--bad)", txt: "alta" };
  if (s >= 130 || d >= 85) return { k: "atencao", cor: "var(--warn)", txt: "limítrofe" };
  return { k: "ok", cor: "var(--ok)", txt: "dentro do esperado" };
}
function bpAdvice(c) {
  if (c.k === "crise") return " Isso está muito alto. Se tiver dor no peito, falta de ar, dor de cabeça forte ou mal-estar, procure atendimento agora.";
  if (c.k === "alta") return " Está acima do ideal. Descanse, meça de novo em alguns minutos e, se continuar assim, fale com seu médico.";
  if (c.k === "atencao") return " Está no limite. Vale ficar de olho nos próximos dias.";
  return " Tá dentro do esperado, boa!";
}
async function addBP(s, d, p, n) {
  const r = { t: Date.now(), s: +s, d: +d, p: p ? +p : null, n: n || "" };
  S.bp.push(r);
  try { await dbAddBP(r); } catch (e) { toast("Anotei aqui, mas não sincronizou: " + e.message); }
  renderHealth();
  return classifyBP(r.s, r.d);
}
async function addMed() {
  const r = { t: Date.now() };
  S.meds.push(r);
  try { await dbAddMed(r); } catch (e) { toast("Anotei aqui, mas não sincronizou: " + e.message); }
  renderHealth();
}

function renderHealth() {
  const last = S.bp.slice(-10).reverse();
  $("#bpList").innerHTML = last.length ? last.map((r) => {
    const c = classifyBP(r.s, r.d);
    return '<div class="item"><span class="dot" style="background:' + c.cor + '"></span><div style="flex:1"><div class="big">' + r.s + "/" + r.d + (r.p ? ' <span class="mut">· ' + r.p + " bpm</span>" : "") + '</div><div class="mut">' + fmtDT(r.t) + (r.n ? " · " + esc(r.n) : "") + '</div></div><span class="tag" style="color:' + c.cor + ';border-color:' + c.cor + '">' + c.txt + "</span></div>";
  }).join("") : '<div class="mut">Nenhuma medição ainda.</div>';
  const pts = S.bp.slice(-14);
  if (pts.length >= 2) {
    const W = 320, H = 90, mn = 50, mx = 180, X = (i) => 8 + i * (W - 16) / (pts.length - 1), Y = (v) => H - 6 - (v - mn) / (mx - mn) * (H - 12);
    const line = (k, col) => '<polyline fill="none" stroke="' + col + '" stroke-width="2" points="' + pts.map((r, i) => X(i) + "," + Y(r[k])).join(" ") + '"/>';
    $("#bpChart").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" style="width:100%;height:auto;margin-bottom:8px"><line x1="0" x2="' + W + '" y1="' + Y(130) + '" y2="' + Y(130) + '" stroke="#2a4466" stroke-dasharray="4 4"/>' + line("s", "#19c3ff") + line("d", "#8b7cff") + "</svg>";
  } else $("#bpChart").innerHTML = "";
  const m = S.meds.slice(-5).reverse();
  $("#medList").innerHTML = m.length ? m.map((r) => fmtDT(r.t)).join(" · ") : "Nenhum registro de remédio.";
  renderOura();
}

/* ---------- Oura ---------- */
async function loadOura(force) {
  if (!remote()) return null;
  if (!force && S.oura && Date.now() - S.ouraAt < 5 * 60000) return S.oura;
  S.oura = await API.fn("/oura/status");
  S.ouraAt = Date.now();
  return S.oura;
}
function renderOura() {
  const box = $("#ouraBox");
  if (!remote()) { box.innerHTML = '<div class="mut">Disponível depois de ativar o servidor (Config).</div>'; return; }
  const o = S.oura;
  if (!o) { box.innerHTML = '<div class="mut">Carregando...</div>'; return; }
  if (!o.connected) {
    box.innerHTML = '<div class="mut">Conecte o Oura para ver sono, prontidão e atividade aqui e no briefing da manhã.</div><div class="btnrow"><button class="btn" id="ouraConnect">Conectar Oura</button></div>';
    $("#ouraConnect").onclick = async () => { try { location.href = (await API.fn("/oura/auth-url")).url; } catch (e) { toast(e.message); } };
    return;
  }
  const days = o.days || [];
  const t = days[days.length - 1];
  if (!t) { box.innerHTML = '<div class="mut">Conectado. Ainda sem dados.</div><div class="btnrow"><button class="btn ghost" id="ouraSync">Sincronizar</button></div>'; $("#ouraSync").onclick = syncOuraNow; return; }
  const cell = (label, val, unit) => '<div class="kpi"><div class="v">' + (val == null ? "–" : val) + (unit && val != null ? '<small>' + unit + "</small>" : "") + '</div><div class="l">' + label + "</div></div>";
  const bars = days.map((d) => {
    const v = d.sleep_score || 0, cor = v >= 85 ? "var(--ok)" : v >= 70 ? "var(--warn)" : "var(--bad)";
    return '<div class="bar" title="' + d.day + ': ' + v + '"><i style="height:' + Math.max(6, v) + '%;background:' + cor + '"></i></div>';
  }).join("");
  box.innerHTML = '<div class="mut" style="margin-bottom:8px">Último dado: ' + esc(t.day) + "</div>" +
    '<div class="kgrid">' + cell("Sono", t.sleep_score, "") + cell("Prontidão", t.readiness_score, "") + cell("Atividade", t.activity_score, "") +
    cell("Dormiu", t.sleep_h, " h") + cell("HRV", t.hrv, " ms") + cell("FC mínima", t.hr_lowest, " bpm") + "</div>" +
    '<div class="mut" style="margin:10px 0 4px">Nota de sono, últimos dias</div><div class="bars">' + bars + "</div>" +
    '<div class="btnrow"><button class="btn ghost" id="ouraSync">Sincronizar agora</button></div>';
  $("#ouraSync").onclick = syncOuraNow;
}
async function syncOuraNow() {
  try { toast("Sincronizando Oura..."); await API.fn("/oura/sync", { method: "POST" }); await loadOura(true); renderOura(); toast("Oura atualizado."); } catch (e) { toast(e.message); }
}
async function ouraAnswer() {
  const o = await loadOura(false).catch(() => null);
  if (!o || !o.connected) return "O Oura ainda não está conectado. Conecta na aba Saúde.";
  const t = (o.days || [])[(o.days || []).length - 1];
  if (!t) return "Conectei no Oura, mas ainda não chegaram dados. Toca em sincronizar na aba Saúde.";
  const parts = [];
  if (t.sleep_h != null) parts.push("você dormiu " + String(t.sleep_h).replace(".", ",") + " horas");
  if (t.sleep_score != null) parts.push("nota de sono " + t.sleep_score);
  if (t.readiness_score != null) parts.push("prontidão " + t.readiness_score);
  if (t.hrv != null) parts.push("HRV " + t.hrv);
  let msg = "No último registro, " + parts.join(", ") + ".";
  if (t.readiness_score != null && t.readiness_score < 65) msg += " A prontidão tá baixa, então pega leve hoje.";
  else if (t.readiness_score != null && t.readiness_score >= 85) msg += " Tá no melhor ritmo, dá pra render hoje.";
  return msg;
}
