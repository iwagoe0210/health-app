"use strict";
/* ===== Agenda: várias contas Google numa linha do tempo ===== */
async function loadAgenda(force) {
  if (!remote()) return null;
  if (!force && S.agenda && Date.now() - S.agendaAt < 5 * 60000) return S.agenda;
  S.agenda = await API.fn("/agenda?days=7" + (force ? "&force=1" : ""));
  S.agendaAt = Date.now();
  return S.agenda;
}
const evHour = (e) => (e.allDay ? "DIA TODO" : fmtHour(e.start));
const evDays = (e) => {
  const a = dayKey(e.start);
  if (!e.allDay) return [a];
  const out = [], endKey = dayKey(new Date(Date.parse(e.end) - 1));
  for (let k = a, g = 0; k <= endKey && g < 14; g++) { out.push(k); k = new Date(Date.parse(k + "T12:00:00Z") + 86400000).toISOString().slice(0, 10); }
  return out.length ? out : [a];
};

function renderAgenda() {
  const box = $("#agendaBox");
  if (!remote()) { box.innerHTML = '<div class="card"><div class="mut">A agenda aparece depois de ativar o servidor e conectar suas contas Google (Config).</div></div>'; return; }
  const a = S.agenda;
  if (!a) { box.innerHTML = '<div class="mut">Carregando...</div>'; return; }
  let html = "";
  if (a.errors && a.errors.length) html += '<div class="card warn">⚠ ' + a.errors.map(esc).join("<br>") + "</div>";
  if (!a.events.length) html += '<div class="card"><div class="mut">Nenhum compromisso nos próximos 7 dias' + ". Se ainda não conectou suas contas Google, vá em Config." + "</div></div>";
  const byDay = {};
  a.events.forEach((e) => evDays(e).forEach((k) => (byDay[k] = byDay[k] || []).push(e)));
  const upcoming = a.events.find((e) => !e.allDay && Date.parse(e.start) > Date.now());
  Object.keys(byDay).filter((k) => k >= todayKey()).sort().forEach((k) => {
    html += '<h2 class="' + (k === todayKey() ? "hoje" : "") + '">' + esc(dayLabel(k)) + "</h2><div class=\"card\">";
    html += byDay[k].map((e) => {
      const nxt = upcoming && e.id === upcoming.id ? '<span class="tag" style="color:var(--acc);border-color:var(--acc)">' + inTime(e.start) + "</span>" : "";
      return '<div class="item"><span class="bar-c" style="background:' + esc(e.color) + '"></span><div class="hr-t">' + evHour(e) + '</div><div style="flex:1;min-width:0"><div class="ttl">' + esc(e.title) + "</div><div class=\"mut\">" + esc(e.account) + (e.location ? " · " + esc(e.location) : "") + "</div></div>" + nxt + "</div>";
    }).join("");
    html += "</div>";
  });
  box.innerHTML = html;
}
async function refreshAgenda(force) {
  if (!remote()) return renderAgenda();
  try { await loadAgenda(force); } catch (e) { S.agenda = { events: [], errors: [e.message] }; }
  renderAgenda();
}

/* ---------- criar compromisso (sempre com confirmação) ---------- */
function openEventSheet(pre) {
  pre = pre || {};
  const d = pre.start ? new Date(pre.start) : new Date(Date.now() + 3600000);
  const dk = d.toLocaleDateString("sv-SE", { timeZone: TZ }), hk = d.toLocaleTimeString("sv-SE", { timeZone: TZ }).slice(0, 5);
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(pre.start || "");
  $("#sheet").innerHTML = "<h2>Novo compromisso</h2>" +
    '<label>Título</label><input class="inp" id="evT" value="' + esc(pre.title || "") + '">' +
    '<div class="grid2"><div><label>Data</label><input class="inp" id="evD" type="date" value="' + (allDay ? pre.start : dk) + '"></div><div><label>Hora</label><input class="inp" id="evH" type="time" value="' + (allDay ? "" : hk) + '"></div></div>' +
    '<label>Duração (min) — vazio = dia inteiro</label><input class="inp" id="evM" type="number" value="' + (allDay ? "" : (pre.end ? Math.max(15, Math.round((Date.parse(pre.end) - Date.parse(pre.start)) / 60000)) : 60)) + '">' +
    '<label>Observação</label><input class="inp" id="evN" value="' + esc(pre.notes || "") + '">' +
    '<div class="mut" style="margin-top:8px">Vai para a sua agenda "Health" no Google. Nada nas outras agendas é alterado.</div>' +
    '<div class="btnrow"><button class="btn" id="evSave">Criar</button><button class="btn ghost" id="evCancel">Cancelar</button></div>';
  $("#modal").classList.remove("hide");
  $("#evCancel").onclick = closeModal;
  $("#evSave").onclick = async () => {
    const title = $("#evT").value.trim(), day = $("#evD").value, hour = $("#evH").value, mins = +$("#evM").value;
    if (!title || !day) return toast("Falta título ou data.");
    let start = day, end = "";
    if (hour && mins) { start = day + "T" + hour + ":00-03:00"; end = new Date(Date.parse(start) + mins * 60000).toISOString(); }
    try {
      $("#evSave").disabled = true;
      const r = await API.fn("/agenda/create", { body: { title, start, end, notes: $("#evN").value.trim() } });
      closeModal(); toast("Compromisso criado."); await refreshAgenda(true);
      return r;
    } catch (e) { $("#evSave").disabled = false; toast(e.message); }
  };
}

/* ---------- respostas por voz (sem gastar IA) ---------- */
function agendaDay(events, key) {
  return events.filter((e) => evDays(e).includes(key));
}
async function agendaToday() {
  const a = await loadAgenda(false).catch(() => null);
  if (!a) return "Não consegui ler a agenda agora.";
  const ev = agendaDay(a.events, todayKey());
  if (!ev.length) return "Hoje você não tem nada marcado, " + CONFIG.address + ". Dia livre!";
  return "Hoje você tem " + ev.length + (ev.length > 1 ? " compromissos: " : " compromisso: ") + ev.map((e) => (e.allDay ? "o dia todo, " : "às " + fmtHour(e.start).replace(":", " e ").replace(" e 00", "") + ", ") + e.title).join("; ") + ".";
}
async function agendaNext() {
  const a = await loadAgenda(false).catch(() => null);
  if (!a) return "Não consegui ler a agenda agora.";
  const e = a.events.find((x) => !x.allDay && Date.parse(x.start) > Date.now());
  if (!e) return "Não vejo nenhum compromisso marcado pelos próximos dias.";
  return "Seu próximo compromisso é " + e.title + ", " + inTime(e.start) + ", às " + fmtHour(e.start) + ".";
}
async function agendaWeek() {
  const a = await loadAgenda(false).catch(() => null);
  if (!a) return "Não consegui ler a agenda agora.";
  if (!a.events.length) return "A semana está livre.";
  const keys = Array.from(new Set(a.events.flatMap(evDays))).filter((k) => k >= todayKey()).sort().slice(0, 5);
  return keys.map((k) => dayLabel(k).split(" · ")[0].toLowerCase() + ": " + agendaDay(a.events, k).slice(0, 3).map((e) => e.title).join(", ")).join(". ") + ".";
}
