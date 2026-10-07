"use strict";
/* ===== Principal: abas, comandos de voz, conversa, login e configurações ===== */

/* ---------- boot → ativação ---------- */
$("#bootName").textContent = CONFIG.name.toUpperCase();
$("#actName").textContent = CONFIG.name.toUpperCase();
$("#topName").textContent = CONFIG.name.toUpperCase();
setTimeout(() => {
  $("#boot").classList.add("out");
  $("#activate").classList.remove("hide");
  requestAnimationFrame(() => $("#activate").classList.remove("out"));
  setTimeout(() => $("#boot").classList.add("hide"), 700);
}, 2200);

$("#btnActivate").addEventListener("click", async () => {
  $("#activate").classList.add("out");
  $("#app").classList.remove("hide");
  setTimeout(() => $("#activate").classList.add("hide"), 700);
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  renderChips();
  if (API.enabled && !API.loggedIn) showLogin(); else await afterLogin();
});

function showLogin() {
  $("#sheet").innerHTML = "<h2>Entrar no " + esc(CONFIG.name) + "</h2>" +
    '<label>E-mail</label><input class="inp" id="lgE" type="email" autocomplete="username" value="' + esc(LS.get("health_email", "")) + '">' +
    '<label>Senha</label><input class="inp" id="lgP" type="password" autocomplete="current-password">' +
    '<div class="btnrow"><button class="btn" id="lgGo">Entrar</button></div><div class="mut" id="lgErr" style="margin-top:8px"></div>';
  $("#modal").classList.remove("hide");
  $("#modal").dataset.lock = "1";
  const go = async () => {
    try {
      $("#lgGo").disabled = true;
      await API.login($("#lgE").value.trim(), $("#lgP").value);
      LS.set("health_email", $("#lgE").value.trim());
      delete $("#modal").dataset.lock; closeModal();
      await afterLogin();
    } catch (e) { $("#lgErr").textContent = e.message; $("#lgGo").disabled = false; }
  };
  $("#lgGo").onclick = go;
  $("#lgP").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

async function afterLogin() {
  const qs = new URLSearchParams(location.search);
  if (qs.get("conectado")) toast("Conectado: " + qs.get("conectado") + (qs.get("conta") ? " (" + qs.get("conta") + ")" : ""));
  if (qs.get("erro")) toast(qs.get("erro"));
  if (qs.get("conectado") || qs.get("erro")) history.replaceState(null, "", location.pathname);
  try {
    if (remote()) {
      await loadAll();
      if (await migrateLocalIfEmpty()) toast("Suas notas foram para o servidor.");
      loadSettings();
    }
  } catch (e) { toast("Não consegui carregar do servidor: " + e.message); }
  renderGraph(); renderHealth(); renderCfg();
  if (remote()) {
    loadOura(false).then(renderOura).catch(() => {});
    refreshAgenda(false); refreshInbox(false, true); refreshNews(false); loadTasks(); loadReminders(); loadReview();
    setInterval(() => { refreshInbox(true, true); }, 15 * 60000);
    setInterval(() => { refreshAgenda(true); }, 10 * 60000);
  }
  if (location.hash === "#digest") { showTab("digest"); await loadDigest(false).catch(() => {}); renderDigest(); }
  const h = new Date().getHours();
  const per = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const msg = per + ", " + CONFIG.address + "! " + CONFIG.name + " online. Em que posso ajudar?";
  if (remote() && h < 12 && (await autoDigestOncePerDay())) return;
  setReply(msg); speak(msg);
  if (!remote() && !LS.get("health_key", "")) setReply(msg + " Antes de conversar, cole sua chave da API em Config.");
}

/* ---------- abas ---------- */
const MAIN_TABS = ["home", "agenda", "inbox", "health", "more"];
const SUBTABS = { brain: "more", news: "more", digest: "more", cfg: "more" };
function showTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("on", t.id === "tab-" + name));
  const nav = SUBTABS[name] || name;
  $$("nav button").forEach((b) => b.classList.toggle("on", b.dataset.tab === nav));
  if (name === "brain") renderGraph();
  if (name === "health") { renderHealth(); loadOura(false).then(renderOura).catch(() => {}); }
  if (name === "agenda") refreshAgenda(false);
  if (name === "inbox") refreshInbox(false, true);
  if (name === "news") refreshNews(false);
  if (name === "digest") { loadDigest(false).then(renderDigest).catch(renderDigest); loadReview(); }
  if (name === "cfg") renderCfg();
  $(".tab.on").scrollTop = 0;
}
$$("nav button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
$$("[data-go]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.go)));

$("#mic").addEventListener("click", () => (listening ? stopListen() : startListen()));
$("#orb").addEventListener("click", () => (listening ? stopListen() : startListen()));
$("#stop").addEventListener("click", () => stopSpeak());
$("#txt").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.value.trim()) { const t = e.target.value.trim(); e.target.value = ""; handle(t); }
});
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" && !e.target.dataset.lock) closeModal(); });

/* ---------- comandos locais (sem gastar IA) ---------- */
async function localCommand(text) {
  const t = norm(text);
  if (/^(para|cala|silencio|chega)\b/.test(t)) { stopSpeak(); return "Beleza."; }
  if (/press[aã]o|pressao/.test(t)) {
    const m = t.match(/(\d{1,3})\s*(?:por|x|\/|e)\s*(\d{1,3})/);
    if (m && /(registr|anot|marc|medi|deu|ficou|estava|esta)/.test(t)) {
      let s = +m[1], d = +m[2];
      if (s < 30) s *= 10;
      if (d < 20) d *= 10;
      if (s >= 60 && s <= 260 && d >= 30 && d <= 160) { const c = await addBP(s, d); return "Anotado: " + s + " por " + d + "." + bpAdvice(c); }
    }
  }
  if (/(tomei|ja tomei|tomado).*(remedio|medicamento|comprimido)|(remedio|medicamento).*(tomei|tomado)/.test(t)) { await addMed(); return "Remédio registrado, " + CONFIG.address + "."; }
  if (!remote()) return null;
  const work = async (fn) => { setState("think"); try { return await fn(); } finally { if (!S.busy) setState("idle"); } };
  if (/^(oi |ola )?(health )?bom dia\b/.test(t)) return work(() => digestAnswer(false));
  if (/(atualizar|atualiza).*(e-?mails?|caixa)/.test(t)) return work(async () => { await refreshInbox(true); return "E-mails atualizados. " + (await inboxAnswer()); });
  if (/(atualizar|atualiza).*noticias/.test(t)) return work(async () => { await refreshNews(true); return "Notícias atualizadas."; });
  if (/(proximo compromisso|proxima reuniao|proximo evento)/.test(t)) return work(agendaNext);
  if (/agenda da semana|compromissos da semana|semana.*agenda/.test(t)) return work(agendaWeek);
  if (/(minha agenda|o que (eu )?tenho (pra |para )?hoje|compromissos de hoje|agenda de hoje)/.test(t)) return work(agendaToday);
  if (/(tem|algum).*(e-?mail).*(importante|urgente)|e-?mails? importantes?/.test(t)) return work(() => inboxAnswer("importante"));
  if (/(minhas contas|contas a pagar|o que vence|vencimentos?|contas pendentes)/.test(t)) return work(billsAnswer);
  if (/(meus lembretes|quais lembretes|lembretes ativos)/.test(t)) return work(remindersAnswer);
  if (/(minhas tarefas|o que (eu )?tenho (pra|para) fazer|tarefas (abertas|pendentes))/.test(t)) return work(tasksAnswer);
  if (/(revisao da semana|como foi a semana)/.test(t)) return work(async () => { await loadReview(); return $("#reviewText").textContent; });
  if (/(meus e-?mails|meu e-?mail|caixa de entrada)/.test(t)) return work(() => inboxAnswer());
  if (/^(me (de|fala|conta) )?(as )?noticias/.test(t)) {
    const nm = t.match(/noticias(?: de| sobre| do| da| dos| das)? ?(.*)$/);
    return work(() => newsAnswer(nm ? nm[1].trim() : ""));
  }
  if (/(como (eu )?dormi|meu sono|minha prontidao|como estou de saude|oura)/.test(t)) return work(ouraAnswer);
  return null;
}

/* ---------- conversa com a IA ---------- */
function localSystemPrompt() {
  const by = {};
  S.notes.forEach((n) => { (by[n.area] = by[n.area] || []).push(n); });
  const brain = Object.keys(by).map((a) => (AREA[a] ? AREA[a].label : a).toUpperCase() + ":\n" + by[a].map((n) => "- " + n.title + ": " + n.body).join("\n")).join("\n\n");
  const r = S.bp.slice(-7).map((x) => fmtDT(x.t) + " " + x.s + "/" + x.d).join("; ");
  const agora = new Date().toLocaleString("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return [
    "Você é " + CONFIG.name + ", o assistente pessoal e secretário de " + CONFIG.address + ". Personalidade " + CONFIG.persona + ": papo reto, bem-humorado, de amigo competente. Trate-o por " + CONFIG.address + ".",
    "Responda sempre em português do Brasil, em 2 a 4 frases curtas, faladas, sem emojis e sem markdown.",
    "Agora é " + agora + ". Pressão recente: " + (r || "nenhuma") + ".",
    "Você NÃO é médico: nunca mude dose nem receite; mande procurar atendimento se a pressão for 180/120 ou mais ou houver sintomas fortes.",
    "SECOND BRAIN:\n" + (brain || "(vazio)"),
    "MEMÓRIA VIVA: se ele revelar algo novo e duradouro, TERMINE com [[SAVE:area|titulo|texto]] (area ∈ metas, trabalho, projetos, financas, aprendizado, saude, relacoes, meta)."
  ].join("\n\n");
}
const SAVE_RE = /\[\[SAVE:([a-z_]+)\|([^|\]]+)\|([\s\S]+?)\]\]/g;

async function handle(text) {
  if (S.busy) return;
  setYou(text);
  let local = null;
  try { local = await localCommand(text); } catch (e) { local = "Deu um erro aqui: " + e.message; }
  if (local) { setReply(local); speak(local); return; }

  S.busy = true; setState("think");
  S.hist.push({ role: "user", content: text });
  if (S.hist.length > 14) S.hist = S.hist.slice(-14);
  try {
    let out = "", proposals = [];
    if (remote()) {
      const r = await API.fn("/chat", { body: { messages: S.hist } });
      out = r.reply; proposals = r.proposals || [];
      if (r.tasksAdded || (r.tasksDone || []).length) loadTasks();
      if ((r.done || []).length) { loadReminders(); if (r.done.some((x) => /^Agendado|^Compromisso apagado/.test(x))) refreshAgenda(true); if (r.done.some((x) => /^Conta marcada/.test(x))) refreshInbox(true, true); toast(r.done.join(" · ")); }
      if (r.saved && r.saved.length) { await loadAll(); S.flashId = r.saved[0]; renderGraph(); }
    } else {
      const key = LS.get("health_key", "");
      if (!key) { S.hist.pop(); const m = "Cola sua chave da API em Config, " + CONFIG.address + ", que eu volto a conversar."; setReply(m); speak(m); return; }
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true", "content-type": "application/json" },
        body: JSON.stringify({ model: S.model, max_tokens: 500, system: localSystemPrompt(), messages: S.hist })
      });
      if (!res.ok) { S.hist.pop(); const m = "Deu erro na conexão com o cérebro (código " + res.status + "). Confere a chave da API em Config."; setReply(m); speak(m); return; }
      const data = await res.json();
      out = (data.content && data.content[0] && data.content[0].text) || "Hmm, não veio resposta. Tenta de novo?";
      let m2;
      SAVE_RE.lastIndex = 0;
      while ((m2 = SAVE_RE.exec(out))) {
        const area = m2[1].trim(), title = m2[2].trim(), body = m2[3].trim();
        if (!AREA[area]) continue;
        const ex = S.notes.find((n) => norm(n.title) === norm(title));
        if (ex) { ex.body = body; ex.area = area; S.flashId = ex.id; }
        else {
          const id = "n" + Date.now();
          S.notes.push({ id, area, title, body });
          const hub = S.notes.find((n) => n.area === area && n.id !== id) || S.notes.find((n) => n.id === "voce");
          if (hub) S.rel.push([id, hub.id]);
          S.flashId = id;
        }
      }
      out = out.replace(SAVE_RE, "").trim();
      saveLocal(); renderGraph();
    }
    S.hist.push({ role: "assistant", content: out });
    setReply(out); speak(out);
    if (proposals.length) setTimeout(() => openEventSheet(proposals[0]), 400);
  } catch (e) {
    S.hist.pop();
    const m = remote() ? "Não consegui falar com o servidor: " + e.message : "Não consegui conectar. Vê se você está com internet.";
    setReply(m); speak(m);
  } finally {
    S.busy = false;
    if (!(window.speechSynthesis && speechSynthesis.speaking) && !player) setState("idle");
  }
}

/* ---------- saúde: botões ---------- */
$("#bpSave").addEventListener("click", async () => {
  const s = +$("#bpS").value, d = +$("#bpD").value;
  if (!(s >= 60 && s <= 260 && d >= 30 && d <= 160)) { alert("Confira os valores da pressão."); return; }
  const c = await addBP(s, d, $("#bpP").value, $("#bpN").value);
  ["#bpS", "#bpD", "#bpP", "#bpN"].forEach((x) => ($(x).value = ""));
  const msg = "Anotado: " + s + " por " + d + "." + bpAdvice(c);
  setReply(msg); speak(msg);
});
$("#medTake").addEventListener("click", async () => { await addMed(); const m = "Remédio registrado, " + CONFIG.address + "."; setReply(m); speak(m); });

/* ---------- atalhos ---------- */
function renderChips() {
  const items = remote()
    ? ["Bom dia", "Minha agenda", "Meus e-mails", "Minhas contas", "Minhas tarefas", "Como dormi?"]
    : ["Como estou de saúde?", "Quais são minhas metas?", "O que você sabe fazer?"];
  $("#chips").innerHTML = items.map((t) => '<button class="chip">' + esc(t) + "</button>").join("");
  $$("#chips .chip").forEach((c) => c.addEventListener("click", () => handle(c.textContent)));
}

/* ---------- configurações ---------- */
let settings = {};
const VOICES = {
  google: [["pt-BR-Chirp3-HD-Orus", "Orus (masculina, natural)"], ["pt-BR-Chirp3-HD-Charon", "Charon (masculina, grave)"], ["pt-BR-Chirp3-HD-Fenrir", "Fenrir (masculina, enérgica)"], ["pt-BR-Chirp3-HD-Puck", "Puck (masculina, leve)"], ["pt-BR-Chirp3-HD-Algieba", "Algieba (masculina, calma)"], ["pt-BR-Neural2-B", "Neural2 B (masculina, clássica)"]],
  elevenlabs: [["JBFqnCBsd6RMkjVDRZzb", "George (britânico, caloroso)"], ["onwK4e9ZLuTAKqWW03F9", "Daniel (britânico, grave, estilo mordomo)"], ["nPczCjzI2devNBz1zQrb", "Brian (americano, profundo)"]]
};
function fillVoices(prov, current) {
  const list = VOICES[prov] || VOICES.google;
  $("#cfgVoiceName").innerHTML = list.map((v) => '<option value="' + v[0] + '">' + esc(v[1]) + "</option>").join("");
  $("#cfgVoiceName").value = list.some((v) => v[0] === current) ? current : list[0][0];
}
$("#cfgVoiceProv").addEventListener("change", () => fillVoices($("#cfgVoiceProv").value, ""));
async function loadSettings() {
  try {
    settings = await API.fn("/settings");
    if (settings.model_level) $("#cfgModel").value = settings.model_level;
    if (settings.playbook) $("#playbookTxt").value = settings.playbook;
    if (settings.med_hour) $("#medHour").value = settings.med_hour;
    $("#cfgVoiceProv").value = settings.tts_provider || "google";
    fillVoices($("#cfgVoiceProv").value, settings.tts_voice);
    if (settings.news_topics) $("#cfgTopics").value = settings.news_topics.join("\n");
    else $("#cfgTopics").value = ["tecnologia", "economia Brasil", "marketing digital", "DTF estamparia têxtil", "inteligência artificial", "personalização de produtos", "novas tecnologias de personalização e estamparia"].join("\n");
  } catch (e) {}
}
async function renderCfg() {
  $("#cfgLocal").classList.toggle("hide", remote());
  $("#cfgRemote").classList.toggle("hide", !remote());
  $("#cfgModel").innerHTML = remote()
    ? '<option value="fast">Econômico · Haiku 4.5</option><option value="balanced">Equilibrado · Sonnet 5.5</option><option value="max">Máximo · Opus 5.5</option>'
    : '<option value="claude-haiku-4-5-20251001">Econômico · Haiku 4.5</option><option value="claude-sonnet-5-5">Equilibrado · Sonnet 5.5</option><option value="claude-opus-5-5">Máximo · Opus 5.5</option>';
  $("#cfgModel").value = remote() ? (settings.model_level || "fast") : S.model;
  $("#cfgVoiceMode").value = LS.get("health_voice", "server");
  $("#cfgKey").value = LS.get("health_key", "");
  $("#srvState").textContent = !API.enabled ? "Servidor ainda não ativado neste app (modo local)." : remote() ? "Servidor conectado ✓" : "Servidor configurado, mas você não entrou.";
  if (remote()) {
    try {
      const a = (await API.fn("/accounts")).accounts;
      $("#gAccounts").innerHTML = a.length ? a.map((x) => '<div class="item"><span class="dot" style="background:' + esc(x.color) + '"></span><div style="flex:1"><div class="ttl">' + esc(x.label) + '</div><div class="mut">' + esc(x.email) + (x.provider === "imap" ? " · e-mail (IMAP)" : " · Google") + '</div></div><button class="small" data-rm="' + esc(x.id) + '" aria-label="Remover">✕</button></div>').join("") : '<div class="mut">Nenhuma conta conectada.</div>';
      $$("[data-rm]", $("#gAccounts")).forEach((b) => (b.onclick = async () => { if (!confirm("Remover esta conta do Health?")) return; await API.fn("/accounts?id=" + encodeURIComponent(b.dataset.rm), { method: "DELETE" }); renderCfg(); }));
    } catch (e) { $("#gAccounts").textContent = e.message; }
  }
}
$("#cfgSave").addEventListener("click", async () => {
  try {
    if (remote()) {
      await API.fn("/settings", { body: { model_level: $("#cfgModel").value, tts_provider: $("#cfgVoiceProv").value, tts_voice: $("#cfgVoiceName").value } });
      settings.model_level = $("#cfgModel").value;
    } else {
      LS.set("health_key", $("#cfgKey").value.trim());
      S.model = $("#cfgModel").value; LS.set("health_model", S.model);
    }
    LS.set("health_voice", $("#cfgVoiceMode").value);
    toast("Salvo.");
  } catch (e) { toast(e.message); }
});
$("#cfgVoiceTest").addEventListener("click", () => speak("E aí, " + CONFIG.address + "! Aqui é o " + CONFIG.name + ". Tá me ouvindo bem?"));
$("#gAdd").addEventListener("click", async () => {
  try {
    const label = $("#gLabel").value.trim() || "Conta", color = $("#gColor").value;
    location.href = (await API.fn("/google/auth-url?label=" + encodeURIComponent(label) + "&color=" + encodeURIComponent(color))).url;
  } catch (e) { toast(e.message); }
});
$("#iAdd").addEventListener("click", async () => {
  const btn = $("#iAdd");
  try {
    btn.disabled = true; btn.textContent = "Testando...";
    await API.fn("/imap/accounts", { body: { email: $("#iEmail").value, password: $("#iPass").value, host: $("#iHost").value, label: $("#iLabel").value, color: $("#iColor").value } });
    $("#iPass").value = ""; $("#iEmail").value = ""; $("#iLabel").value = "";
    toast("E-mail conectado."); renderCfg(); refreshInbox(true, true);
  } catch (e) { toast(e.message); } finally { btn.disabled = false; btn.textContent = "Conectar e-mail"; }
});
$("#topicsSave").addEventListener("click", async () => {
  try {
    const topics = $("#cfgTopics").value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 10);
    await API.fn("/settings", { body: { news_topics: topics } });
    toast("Assuntos salvos."); refreshNews(true);
  } catch (e) { toast(e.message); }
});
$("#pushOn").addEventListener("click", () => enablePush().catch((e) => toast(e.message)));
$("#pushTest").addEventListener("click", async () => { try { const r = await API.fn("/push/test", { method: "POST", body: {} }); toast(r.sent ? "Enviada." : "Nenhum aparelho ativado ainda."); } catch (e) { toast(e.message); } });
$("#logoutBtn").addEventListener("click", () => { API.logout(); location.reload(); });
$("#resetChat").addEventListener("click", () => { S.hist = []; setReply("Conversa limpa."); });

$("#exportBtn").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ notes: S.notes, rel: S.rel, bp: S.bp, meds: S.meds, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" }));
  a.download = "health-backup-" + todayKey() + ".json";
  a.click();
});
const openFile = () => $("#fileIn").click();
$("#importBtn").addEventListener("click", openFile);
$("#sbImportBtn").addEventListener("click", openFile);
$("#fileIn").addEventListener("change", (e) => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = async () => {
    try {
      const d = JSON.parse(rd.result);
      const nn = (Array.isArray(d) ? d : d.notes || []).filter((n) => n && n.id && AREA[n.area]);
      nn.forEach((n) => { const i = S.notes.findIndex((x) => x.id === n.id); if (i >= 0) S.notes[i] = n; else S.notes.push(n); });
      const newRel = (d.rel || []).filter((r) => !S.rel.some((x) => (x[0] === r[0] && x[1] === r[1]) || (x[0] === r[1] && x[1] === r[0])));
      S.rel.push(...newRel);
      if (remote()) {
        if (nn.length) await API.rest("notes", { method: "POST", body: nn.map((n) => ({ id: n.id, area: n.area, title: n.title, body: n.body })), prefer: "resolution=merge-duplicates" });
        if (newRel.length) await API.rest("note_rel", { method: "POST", body: newRel.map((r) => ({ a: r[0], b: r[1] })), prefer: "resolution=ignore-duplicates" });
      } else {
        if (d.bp && !S.bp.length) S.bp = d.bp;
        if (d.meds && !S.meds.length) S.meds = d.meds;
        saveLocal();
      }
      renderGraph(); renderHealth();
      alert("Importado: " + S.notes.length + " notas.");
    } catch (err) { alert("Não consegui importar: " + err.message); }
    e.target.value = "";
  };
  rd.readAsText(f);
});
$("#sbReload").addEventListener("click", renderGraph);
$("#sbAdd").addEventListener("click", () => openEditor(null));
$("#evAdd").addEventListener("click", () => openEventSheet());
$("#agendaRefresh").addEventListener("click", () => refreshAgenda(true));
$("#inboxRefresh").addEventListener("click", async () => { toast("Atualizando e-mails..."); await refreshInbox(true); });
$("#newsRefresh").addEventListener("click", () => refreshNews(true));
$("#digestNow").addEventListener("click", async () => { setState("think"); const t = await digestAnswer(true); setState("idle"); renderDigest(); return t; });
$("#digestListen").addEventListener("click", () => { const t = $("#digestText").textContent; if (t) speak(t); });

/* ---------- instalação e service worker ---------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; $("#installCard").classList.remove("hide"); });
$("#installBtn").addEventListener("click", async () => { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; $("#installCard").classList.add("hide"); } });
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(() => {});
renderGraph();
renderHealth();
