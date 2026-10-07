"use strict";
/* ===== Second Brain: grafo neural animado + editor de notas ===== */
let pulses = [], edgesGeo = [], raf = null;

function renderGraph() {
  const box = $("#graph");
  const tabOn = $("#tab-brain").classList.contains("on");
  $("#sbEmpty").classList.toggle("hide", S.notes.length > 0);
  const areas = Array.from(new Set(S.notes.map((n) => n.area))).filter((a) => AREA[a]);
  $("#sbCount").textContent = S.notes.length + " notas · " + areas.length + " áreas";
  $("#legend").innerHTML = areas.map((a) => '<span><span class="dot" style="display:inline-block;background:' + AREA[a].color + ';margin-right:5px"></span>' + AREA[a].label + "</span>").join("") + '<span class="ok">✓ contexto injetado em todos os comandos do ' + esc(CONFIG.name) + "</span>";
  if (!S.notes.length) { box.innerHTML = ""; return; }
  const narrow = (box.clientWidth || window.innerWidth) < 600;
  const W = narrow ? 600 : 1000, H = narrow ? 760 : 540;
  const rx = narrow ? 235 : 400, ry = narrow ? 300 : 200, cx = W / 2, cy = H / 2, fs = narrow ? 21 : 15;
  const order = S.notes.filter((n) => AREA[n.area]).sort((a, b) => a.area.localeCompare(b.area));
  const pos = {};
  order.forEach((n, i) => {
    const ang = (i / order.length) * Math.PI * 2 - Math.PI / 2;
    pos[n.id] = { x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) };
  });
  const deg = {};
  const pairs = S.rel.filter((r) => pos[r[0]] && pos[r[1]]);
  pairs.forEach((r) => { deg[r[0]] = (deg[r[0]] || 0) + 1; deg[r[1]] = (deg[r[1]] || 0) + 1; });
  let s = '<defs><linearGradient id="eg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b7cff"/><stop offset="1" stop-color="#2dd4ff"/></linearGradient>' +
    '<radialGradient id="cg"><stop offset="0" stop-color="#c9b8ff"/><stop offset="1" stop-color="#5b3fd0"/></radialGradient>' +
    '<filter id="gl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  edgesGeo = [];
  pairs.forEach((r) => {
    const A = pos[r[0]], B = pos[r[1]];
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const C = { x: mx + (cx - mx) * 0.35, y: my + (cy - my) * 0.35 };
    edgesGeo.push({ A, B, C });
    s += '<path class="edash" d="M' + A.x + " " + A.y + " Q" + C.x + " " + C.y + " " + B.x + " " + B.y + '" fill="none" stroke="url(#eg)" stroke-width="1.6" stroke-opacity=".6"/>';
  });
  order.forEach((n) => { const p = pos[n.id]; s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p.x + '" y2="' + p.y + '" stroke="' + AREA[n.area].color + '" stroke-opacity=".22" stroke-width="1"/>'; });
  s += '<circle class="corepulse" cx="' + cx + '" cy="' + cy + '" r="' + (narrow ? 44 : 38) + '" fill="#8b7cff" opacity=".35"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + (narrow ? 32 : 28) + '" fill="url(#cg)" filter="url(#gl)"/>' +
    '<text x="' + cx + '" y="' + (cy + 9) + '" text-anchor="middle" font-size="' + (narrow ? 28 : 24) + '">🧠</text>';
  order.forEach((n) => {
    const p = pos[n.id], col = AREA[n.area].color, r = (narrow ? 12 : 10) + Math.min(10, (deg[n.id] || 0) * 1.7);
    const t = n.title.length > 15 ? n.title.slice(0, 14) + "…" : n.title;
    s += '<g class="nodeg" data-id="' + esc(n.id) + '">' +
      '<circle class="breath" cx="' + p.x + '" cy="' + p.y + '" r="' + (r + 7) + '" fill="none" stroke="' + col + '" stroke-width="1.5"/>' +
      (n.id === S.flashId ? '<circle class="flash" cx="' + p.x + '" cy="' + p.y + '" r="' + (r + 10) + '" fill="' + col + '" opacity=".5"/>' : "") +
      '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + r + '" fill="' + col + '" filter="url(#gl)"/>' +
      '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (r + 16) + '" fill="transparent"/>' +
      '<text x="' + p.x + '" y="' + (p.y + r + fs + 4) + '" text-anchor="middle" fill="#cfe9ff" font-size="' + fs + '" font-family="system-ui,sans-serif">' + esc(t) + "</text></g>";
  });
  pulses = [];
  const nP = Math.min(12, edgesGeo.length);
  for (let i = 0; i < nP; i++) {
    s += '<circle id="pl' + i + '" r="' + (narrow ? 4 : 3.2) + '" fill="#fff" opacity="0" filter="url(#gl)"/>';
    pulses.push({ e: Math.floor(Math.random() * edgesGeo.length), t: Math.random(), v: 0.004 + Math.random() * 0.006 });
  }
  box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" xmlns="http://www.w3.org/2000/svg">' + s + "</svg>";
  box.querySelectorAll(".nodeg").forEach((g) => g.addEventListener("click", () => openEditor(g.dataset.id)));
  if (S.flashId) { S.flashId = null; setTimeout(() => { if ($("#tab-brain").classList.contains("on")) renderGraph(); }, 3200); }
  if (raf) cancelAnimationFrame(raf);
  if (tabOn && pulses.length) animate();
}
function animate() {
  if (!$("#tab-brain").classList.contains("on")) { raf = null; return; }
  pulses.forEach((p, i) => {
    p.t += p.v;
    if (p.t >= 1) { p.t = 0; p.e = Math.floor(Math.random() * edgesGeo.length); }
    const g = edgesGeo[p.e], el = document.getElementById("pl" + i);
    if (!g || !el) return;
    const t = p.t, u = 1 - t;
    el.setAttribute("cx", u * u * g.A.x + 2 * u * t * g.C.x + t * t * g.B.x);
    el.setAttribute("cy", u * u * g.A.y + 2 * u * t * g.C.y + t * t * g.B.y);
    el.setAttribute("opacity", Math.sin(Math.PI * t).toFixed(2));
  });
  raf = requestAnimationFrame(animate);
}
window.addEventListener("resize", () => { if ($("#tab-brain").classList.contains("on")) renderGraph(); });

function openEditor(id) {
  const n = id ? S.notes.find((x) => x.id === id) : { id: "", area: "metas", title: "", body: "" };
  if (!n) return;
  $("#sheet").innerHTML =
    "<h2>" + (id ? "Editar nota" : "Nova nota") + "</h2>" +
    '<label>Título</label><input class="inp" id="edT" value="' + esc(n.title) + '">' +
    '<label>Área</label><select class="inp" id="edA">' + Object.keys(AREA).map((a) => '<option value="' + a + '"' + (a === n.area ? " selected" : "") + ">" + AREA[a].label + "</option>").join("") + "</select>" +
    '<label>Conteúdo</label><textarea class="inp" id="edB" rows="6">' + esc(n.body) + "</textarea>" +
    '<div class="btnrow"><button class="btn" id="edSave">Salvar</button><button class="btn ghost" id="edCancel">Cancelar</button>' + (id ? '<button class="btn red" id="edDel">Excluir</button>' : "") + "</div>";
  $("#modal").classList.remove("hide");
  $("#edCancel").onclick = closeModal;
  $("#edSave").onclick = async () => {
    const title = $("#edT").value.trim();
    if (!title) return;
    try {
      if (id) {
        n.title = title; n.area = $("#edA").value; n.body = $("#edB").value.trim(); S.flashId = id;
        await dbUpsertNote(n);
      } else {
        const nn = { id: "n" + Date.now(), area: $("#edA").value, title, body: $("#edB").value.trim() };
        S.notes.push(nn);
        await dbUpsertNote(nn);
        const hub = S.notes.find((x) => x.area === nn.area && x.id !== nn.id) || S.notes.find((x) => x.id === "voce");
        if (hub) { S.rel.push([nn.id, hub.id]); await dbAddRel(nn.id, hub.id); }
        S.flashId = nn.id;
      }
      saveLocalIf(); closeModal(); renderGraph();
    } catch (e) { toast("Não salvou: " + e.message); }
  };
  if (id) $("#edDel").onclick = async () => {
    if (!confirm("Excluir esta nota?")) return;
    try {
      S.notes = S.notes.filter((x) => x.id !== id);
      S.rel = S.rel.filter((r) => r[0] !== id && r[1] !== id);
      await dbDeleteNote(id);
      saveLocalIf(); closeModal(); renderGraph();
    } catch (e) { toast("Não excluiu: " + e.message); }
  };
}
const saveLocalIf = () => { if (!remote()) saveLocal(); };
function closeModal() { $("#modal").classList.add("hide"); }
