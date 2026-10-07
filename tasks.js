"use strict";
/* ===== Tarefas, revisão semanal e regras (premissas) ===== */
S.tasks = null;
S.review = null;

async function loadTasks() {
  if (!remote()) return;
  try { S.tasks = (await API.fn("/tasks")).tasks; } catch (e) { S.tasks = []; }
  renderTasks();
}
function dueTag(due) {
  if (!due) return "";
  const today = todayKey();
  if (due < today) return '<span class="dd late">atrasada ' + due.split("-").reverse().slice(0, 2).join("/") + "</span>";
  if (due === today) return '<span class="dd today">hoje</span>';
  return '<span class="dd">' + due.split("-").reverse().slice(0, 2).join("/") + "</span>";
}
function renderTasks() {
  const box = $("#taskList");
  if (!remote()) { $("#tasksCard").classList.add("hide"); return; }
  $("#tasksCard").classList.remove("hide");
  if (!S.tasks) { box.textContent = "Carregando..."; return; }
  box.innerHTML = S.tasks.length ? S.tasks.map((t) => '<div class="task ' + esc(t.priority) + '"><button class="ck" data-id="' + t.id + '" aria-label="Concluir">✓</button><div class="tt">' + esc(t.title) + "</div>" + dueTag(t.due) + "</div>").join("") : "Nenhuma tarefa aberta. Diga “anota tarefa ...” ou digite acima.";
  $$(".ck", box).forEach((b) => (b.onclick = async () => {
    try { S.tasks = (await API.fn("/tasks/done", { body: { id: Number(b.dataset.id), done: true } })).tasks; renderTasks(); toast("Tarefa concluída."); } catch (e) { toast(e.message); }
  }));
}
$("#taskIn").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter" || !e.target.value.trim()) return;
  try {
    S.tasks = (await API.fn("/tasks", { body: { title: e.target.value.trim(), due: $("#taskDue").value || "", priority: "media" } })).tasks;
    e.target.value = ""; $("#taskDue").value = ""; renderTasks();
  } catch (err) { toast(err.message); }
});
async function tasksAnswer() {
  await loadTasks();
  const t = S.tasks || [];
  if (!t.length) return "Você não tem tarefas abertas. Quer anotar alguma?";
  const hoje = todayKey();
  const atrasadas = t.filter((x) => x.due && x.due < hoje).length;
  return "Você tem " + t.length + (t.length === 1 ? " tarefa aberta" : " tarefas abertas") + (atrasadas ? ", " + atrasadas + " atrasada" + (atrasadas > 1 ? "s" : "") : "") + ": " + t.slice(0, 5).map((x) => x.title).join("; ") + ".";
}

/* ---------- revisão da semana ---------- */
async function loadReview() {
  if (!remote()) return;
  try { S.review = await API.fn("/review/latest"); } catch (e) { S.review = null; }
  renderReview();
}
function renderReview() {
  const r = S.review;
  if (!$("#reviewText")) return;
  $("#reviewText").textContent = r && r.text ? r.text : "Ainda sem revisão. Ela chega todo domingo às 18h, ou toque em “Gerar agora”.";
  $("#reviewDay").textContent = r && r.week ? "Semana " + r.week : "";
}
$("#reviewNow").addEventListener("click", async () => {
  try { toast("Montando a revisão..."); setState("think"); await API.fn("/review", { method: "POST", body: {} }); await loadReview(); setState("idle"); } catch (e) { setState("idle"); toast(e.message); }
});
$("#reviewListen").addEventListener("click", () => { const t = $("#reviewText").textContent; if (t) speak(t); });

/* ---------- regras (premissas) ---------- */
$("#playbookSave").addEventListener("click", async () => {
  try { await API.fn("/settings", { body: { playbook: $("#playbookTxt").value, med_hour: Number($("#medHour").value) || 9 } }); toast("Regras salvas. O Health já segue as novas."); } catch (e) { toast(e.message); }
});
$("#playbookReset").addEventListener("click", async () => {
  if (!confirm("Voltar às regras padrão do Health?")) return;
  try { await API.fn("/settings", { body: { playbook: "" } }); const s = await API.fn("/settings"); $("#playbookTxt").value = s.playbook; toast("Regras restauradas."); } catch (e) { toast(e.message); }
});

/* ---------- lembretes ---------- */
S.reminders = null;
async function loadReminders() {
  if (!remote()) return;
  try { S.reminders = (await API.fn("/reminders")).reminders; } catch (e) { S.reminders = []; }
  renderReminders();
}
function renderReminders() {
  const box = $("#remList");
  if (!box) return;
  if (!remote()) { box.textContent = ""; return; }
  if (!S.reminders) { box.textContent = "Carregando..."; return; }
  box.innerHTML = S.reminders.length ? S.reminders.map((r) => '<div class="task ' + (r.importance === "alta" ? "alta" : "") + '"><button class="ck" data-rid="' + r.id + '" aria-label="Feito">✓</button><div class="tt">' + esc(r.text) + (r.importance === "alta" ? " ⚠" : "") + '</div><span class="dd">' + esc(fmtDT(r.remind_at)) + (r.repeat !== "nenhuma" ? " ↻" : "") + "</span></div>").join("") : "Nenhum lembrete. Peça por voz: “me lembra de ... amanhã às 9”.";
  $$("[data-rid]", box).forEach((b) => (b.onclick = async () => {
    try { S.reminders = (await API.fn("/reminders/done", { body: { id: Number(b.dataset.rid) } })).reminders; renderReminders(); toast("Lembrete encerrado."); } catch (e) { toast(e.message); }
  }));
}
$("#remIn").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter" || !e.target.value.trim()) return;
  const at = $("#remAt").value;
  if (!at) return toast("Escolha a data e hora do lembrete.");
  try {
    S.reminders = (await API.fn("/reminders", { body: { text: e.target.value.trim(), at: new Date(at).toISOString(), importance: "media" } })).reminders;
    e.target.value = ""; $("#remAt").value = ""; renderReminders();
  } catch (err) { toast(err.message); }
});
async function remindersAnswer() {
  await loadReminders();
  const r = S.reminders || [];
  if (!r.length) return "Você não tem lembretes ativos.";
  return "Você tem " + r.length + (r.length === 1 ? " lembrete" : " lembretes") + ": " + r.slice(0, 5).map((x) => x.text + ", " + fmtDT(x.remind_at)).join("; ") + ".";
}
