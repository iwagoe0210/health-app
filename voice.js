"use strict";
/* ===== Voz: fala (servidor natural ou navegador) e escuta (toque para falar) ===== */
function setState(s, label) {
  $("#orb").className = "orbwrap " + s;
  const names = { idle: "pronto", listen: "ouvindo", think: "pensando", speak: "falando" };
  $("#topPill").textContent = names[s] || s;
  $("#status").textContent = label || ({ idle: "Toque no orbe ou no microfone", listen: "Ouvindo...", think: "Pensando...", speak: "Falando..." }[s]);
  $("#mic").classList.toggle("rec", s === "listen");
}
function setReply(t) { $("#reply").textContent = t; $("#reply").scrollTop = 0; }
function setYou(t) { $("#you").textContent = t ? "“" + t + "”" : ""; }

/* ---------- divisão do texto em pedaços (igual ao servidor) ---------- */
function chunkText(text, max) {
  max = max || 380;
  const parts = String(text).replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+/);
  const out = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).trim().length > max && cur) { out.push(cur.trim()); cur = p; } else cur = (cur + " " + p).trim();
  }
  if (cur) out.push(cur.trim());
  return out.filter(Boolean);
}
const cleanForSpeech = (t) => String(t).replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();

/* ---------- fala ---------- */
let voices = [];
function loadVoices() { voices = (window.speechSynthesis ? speechSynthesis.getVoices() : []) || []; }
if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function pickVoice() {
  const pt = voices.filter((v) => /pt[-_]BR/i.test(v.lang) || /portugu/i.test(v.name));
  if (!pt.length) return null;
  const nat = pt.filter((v) => /natural|neural|online|google/i.test(v.name));
  const pool = nat.length ? nat : pt;
  return pool.find((v) => /antonio|daniel|felipe|ricardo|male|masc|rjs/i.test(v.name)) || pool[0];
}

let player = null, speakToken = 0;
const useServerVoice = () => remote() && LS.get("health_voice", "server") === "server";

function speakBrowser(text, token) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) return resolve();
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(cleanForSpeech(text));
      u.lang = "pt-BR"; u.pitch = 1; u.rate = 1;
      const v = pickVoice(); if (v) u.voice = v;
      u.onstart = () => { if (token === speakToken) setState("speak"); };
      u.onend = u.onerror = () => resolve();
      speechSynthesis.speak(u);
    } catch (e) { resolve(); }
  });
}

async function fetchAudio(text) {
  const d = await API.fn("/tts", { body: { text } });
  return "data:audio/mpeg;base64," + d.audio;
}
function playUrl(url, token) {
  return new Promise((resolve, reject) => {
    if (token !== speakToken) return resolve();
    player = new Audio(url);
    player.onplay = () => { if (token === speakToken) setState("speak"); };
    player.onended = () => resolve();
    player.onerror = () => reject(new Error("áudio"));
    player.play().catch(reject);
  });
}

async function speak(text) {
  stopSpeak(true);
  const token = ++speakToken;
  const clean = cleanForSpeech(text);
  if (!clean) return;
  if (useServerVoice()) {
    const chunks = chunkText(clean, 380);
    try {
      let next = fetchAudio(chunks[0]);
      for (let i = 0; i < chunks.length; i++) {
        const url = await next;
        if (token !== speakToken) return;
        if (i + 1 < chunks.length) next = fetchAudio(chunks[i + 1]);
        await playUrl(url, token);
        if (token !== speakToken) return;
      }
      if (!S.busy) setState("idle");
      return;
    } catch (e) {
      /* servidor ou áudio falhou: cai para a voz do navegador */
      if (token !== speakToken) return;
    }
  }
  await speakBrowser(clean, token);
  if (token === speakToken && !S.busy) setState("idle");
}

function stopSpeak(silent) {
  speakToken++;
  try { if (player) { player.pause(); player = null; } } catch (e) {}
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  if (!silent) { stopListen(); if (!S.busy) setState("idle"); }
}

/* ---------- escuta ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, finalText = "";
function startListen() {
  if (!SR) { setReply("Este navegador não tem reconhecimento de voz. Use o Chrome do Android ou digite."); return; }
  if (S.busy || listening) return;
  stopSpeak(true);
  rec = new SR();
  rec.lang = "pt-BR"; rec.continuous = false; rec.interimResults = true;
  finalText = "";
  rec.onstart = () => { listening = true; setState("listen"); };
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript + " "; else interim += r[0].transcript;
    }
    setYou((finalText + interim).trim());
  };
  rec.onerror = (ev) => {
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed") setReply("O microfone está bloqueado. Libere nas permissões do site (cadeado na barra do Chrome) e tente de novo.");
    else if (ev.error === "no-speech") setYou("");
  };
  rec.onend = () => {
    listening = false;
    const t = finalText.trim();
    if (t) handle(t); else if (!S.busy) setState("idle");
  };
  try { rec.start(); } catch (e) {}
}
function stopListen() { try { if (rec && listening) rec.stop(); } catch (e) {} }
