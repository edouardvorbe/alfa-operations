import { createSupabaseApi } from "./api-supabase.js";
import { createMockApi } from "./api-mock.js";
import { $, $$, esc, el, toast, modal, confirmDlg, fmtDate, fmtDateTime, deptLabel, dms, downloadXlsx } from "./ui.js";
import { renderStation } from "./station.js";
import { renderAdmin } from "./admin.js";

const CFG = window.APP_CONFIG;
export const api = CFG.mode === "supabase" ? createSupabaseApi(CFG) : createMockApi(CFG);
export const state = { me: null, stations: null, filters: { q: "", dept: "", level: "", grp: "", survey: "", company: "" } };
export const can = { edit: () => ["admin", "editeur"].includes(state.me?.role), admin: () => state.me?.role === "admin" };
export const surveyLabel = c => c ? (CFG.surveyCodes[c] || c) : "—";
export const deptColor = d => CFG.deptColors[d] || "#777";

// ---------------------------------------------------------------- données
export async function loadStations(force = false) {
  if (state.stations && !force) return state.stations;
  state.stations = await api.listStations();
  updateGauge();
  return state.stations;
}
export const isDone = s => !!s.has_fiche;

// Jauge d'avancement dans la barre du haut (surveys disponibles / stations actives)
export function updateGauge() {
  const fill = $("#gaugeFill"), label = $("#gaugeLabel");
  if (!fill || !state.stations) return;
  const act = state.stations.filter(s => s.status === "active"), done = act.filter(isDone).length;
  fill.style.width = (act.length ? Math.round(done / act.length * 100) : 0) + "%";
  label.textContent = `${done} / ${act.length} surveys`;
  label.title = `${done} station(s) avec fiche de survey sur ${act.length}`;
}

// ---------------------------------------------------------------- coquille
function renderShell() {
  const app = $("#app");
  const me = state.me;
  app.innerHTML = `
  <header class="topbar">
    <button class="burger" id="burger" aria-label="Menu">☰</button>
    <a class="brand" href="#/" title="${esc(CFG.company)}"><img src="img/alfa-wordmark-white.png" alt="ALFA"><span class="sep"></span><h1>Operations<small>${esc(CFG.tagline || "Réseau stations · Suivi des surveys")}</small></h1></a>
    <div class="top-gauge" title="Avancement des surveys"><div class="tg-bar"><div class="tg-fill" id="gaugeFill"></div></div><div class="tg-label" id="gaugeLabel">— / —</div></div>
    <nav id="nav">
      <a href="#/" data-r="/">Carte</a>
      <a href="#/liste" data-r="/liste">Stations</a>
      <a href="#/a-faire" data-r="/a-faire">Surveys à faire</a>
      ${can.admin() ? '<a href="#/admin" data-r="/admin">Administration</a>' : ""}
    </nav>
    <div class="user"><span class="nm"><b>${esc(me.full_name || me.email)}</b></span><span class="role">${esc(me.role)}</span>
      <a href="#/compte" class="btn sm">Mon compte</a>
      <button class="btn sm" id="logout">Déconnexion</button></div>
  </header>
  <main id="view"></main>`;
  $("#logout").onclick = async () => { await api.signOut(); state.me = null; document.body.classList.remove("on-map"); location.hash = "#/login"; };
  $("#burger").onclick = () => $("#nav").classList.toggle("open");
  if (state.stations) updateGauge(); else loadStations().catch(() => {});
}
function setActiveNav(path) {
  $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.r === "/" ? path === "/" : path.startsWith(a.dataset.r)));
  $("#nav")?.classList.remove("open");
  document.body.classList.toggle("on-map", path === "/");
}

// ---------------------------------------------------------------- login
function renderLogin(msg) {
  document.body.classList.remove("on-map");
  $("#app").innerHTML = `
  <div class="login"><div class="cover">
    <img src="img/alfa-wordmark-white.png" alt="ALFA">
    <div class="sub">Operations · Réseau stations</div>
    <form class="box" id="loginForm">
      <h1>Connexion</h1><p class="sub">Suivi des surveys et du rebranding — ${esc(CFG.company)}</p>
      ${msg ? `<div class="warnbox" style="margin-bottom:12px">${esc(msg)}</div>` : ""}
      <div class="field"><label>E-mail</label><input type="email" id="email" autocomplete="username" required></div>
      <div class="field"><label>Mot de passe</label><input type="password" id="pw" autocomplete="current-password" required></div>
      <div class="err" id="err" hidden></div>
      <button class="btn primary" style="width:100%;justify-content:center;padding:11px" type="submit">Se connecter</button>
      <p class="small muted" style="margin:14px 0 0"><a href="#" id="forgot">Mot de passe oublié ?</a>${api.mode === "mock" ? " · <span>Mode essai : admin@alfa.ht / demo</span>" : ""}</p>
    </form>
    <div class="foot">Accès réservé · ${esc(CFG.company)}</div>
  </div></div>`;
  $("#loginForm").onsubmit = async e => {
    e.preventDefault(); const err = $("#err"); err.hidden = true;
    try {
      const me = await api.signIn($("#email").value, $("#pw").value);
      if (!me || !me.active || !me.role) { err.textContent = "Ce compte n'est pas (ou plus) autorisé. Contactez l'administrateur."; err.hidden = false; await api.signOut(); return; }
      state.me = me; location.hash = "#/"; boot();
    } catch (ex) { err.textContent = /invalid/i.test(ex.message) ? "E-mail ou mot de passe incorrect." : ex.message; err.hidden = false; }
  };
  $("#forgot").onclick = async e => {
    e.preventDefault(); const email = $("#email").value.trim();
    if (!email) return toast("Entrez d'abord votre e-mail.", true);
    try { await api.resetPassword(email); toast("Un lien de réinitialisation a été envoyé à " + email); } catch (ex) { toast(ex.message, true); }
  };
}

// ---------------------------------------------------------------- carte
let map, markersLayer;
function stationFilter(s) {
  const f = state.filters, q = f.q.trim().toLowerCase();
  if (q && !(s.name + " " + (s.city || "") + " " + s.id).toLowerCase().includes(q)) return false;
  if (f.dept && s.dept !== f.dept) return false;
  if (f.level && (s.level || "—") !== f.level) return false;
  if (f.grp && s.grp !== f.grp) return false;
  if (f.survey === "done" && !isDone(s)) return false;
  if (f.survey === "todo" && isDone(s)) return false;
  if (f.company && (s.company || "") !== f.company) return false;
  return true;
}
const PUMP_SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 3h8a1.5 1.5 0 0 1 1.5 1.5V20H16v-7h1.2V8.1l-1.9-1.9 1.1-1.1 3.1 3.1c.3.3.5.7.5 1.1v8.2a2 2 0 0 1-4 0V16h-1.5v4H16v2H3v-2h.5V4.5A1.5 1.5 0 0 1 5 3zm1.5 2.5v4.5h5V5.5h-5z"/></svg>';
let sideOpen = true, baseName = "sat";
async function renderMap(view) {
  const stations = (await loadStations()).filter(s => s.status === "active");
  const done = stations.filter(isDone).length;
  const companies = [...new Set([...CFG.companies, ...stations.map(s => s.company).filter(Boolean)])];
  const f = state.filters;
  view.innerHTML = `<div class="page wide">
    <div id="map"></div>
    <aside class="side ${sideOpen ? "" : "hidden"}" id="side">
      <div class="side-head"><div class="stats">
        <div class="stat"><b>${stations.length}</b><span>Stations</span></div>
        <div class="stat s-ok"><b>${done}</b><span>Avec survey</span></div>
        <div class="stat s-no"><b>${stations.length - done}</b><span>Restantes</span></div>
      </div></div>
      <div class="side-filters">
        <input type="search" id="fq" placeholder="Rechercher une station, une ville…" value="${esc(f.q)}">
        <div class="filter-row">
          <select id="fdept"><option value="">Département</option>${CFG.depts.map(d => `<option value="${d}" ${f.dept === d ? "selected" : ""}>${deptLabel(d)}</option>`).join("")}</select>
          <select id="flevel"><option value="">Niveau</option>${CFG.levels.map(l => `<option ${f.level === l ? "selected" : ""}>${l}</option>`).join("")}</select>
        </div>
        <div class="filter-row">
          <select id="fsurvey"><option value="">Survey</option><option value="done" ${f.survey === "done" ? "selected" : ""}>Avec survey</option><option value="todo" ${f.survey === "todo" ? "selected" : ""}>À faire</option></select>
          <select id="fcompany"><option value="">Compagnie</option>${companies.map(c => `<option ${f.company === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        </div>
        <div class="chiprow">
          <button class="chip ${f.grp === "" ? "on" : ""}" data-grp="">Toutes</button>
          <button class="chip ${f.grp === "actives" ? "on" : ""}" data-grp="actives">Actives</button>
          <button class="chip ${f.grp === "blanches" ? "on" : ""}" data-grp="blanches">Blanches</button>
        </div>
        <div class="legend"><span><i class="ldot g"></i>Survey disponible</span><span><i class="ldot r"></i>À faire</span><span class="count" id="countLine"></span></div>
      </div>
      <div class="side-list" id="slist"></div>
    </aside>
    <button class="side-toggle ${sideOpen ? "" : "show"}" id="sideToggle">☰ Stations</button>
    <div class="basemaps">
      <button data-bm="sat" class="${baseName === "sat" ? "on" : ""}">Satellite</button>
      <button data-bm="plan" class="${baseName === "plan" ? "on" : ""}">Plan</button>
      <button data-bm="dark" class="${baseName === "dark" ? "on" : ""}">Sombre</button>
    </div>
  </div>`;
  const bind = (id, key) => { $(id).oninput = e => { state.filters[key] = e.target.value; refresh(); }; };
  bind("#fq", "q"); bind("#fdept", "dept"); bind("#flevel", "level"); bind("#fsurvey", "survey"); bind("#fcompany", "company");
  $$(".chip").forEach(c => c.onclick = () => { state.filters.grp = c.dataset.grp; $$(".chip").forEach(x => x.classList.toggle("on", x === c)); refresh(); });
  const toggleSide = () => { sideOpen = !sideOpen; $("#side").classList.toggle("hidden", !sideOpen); const mobile = window.innerWidth <= 900; $("#sideToggle").classList.toggle("show", !sideOpen || mobile); $("#sideToggle").textContent = sideOpen && mobile ? "✕ Fermer la liste" : "☰ Stations"; };
  $("#sideToggle").onclick = toggleSide;
  if (window.innerWidth <= 900) { $("#sideToggle").classList.add("show"); if (sideOpen) $("#sideToggle").textContent = "✕ Fermer la liste"; }

  map = L.map("map", { zoomControl: false, minZoom: 5, maxZoom: 19 }).setView([18.95, -72.85], 8);
  L.control.zoom({ position: "bottomleft" }).addTo(map);
  const bases = {
    sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagerie © Esri, Maxar, Earthstar Geographics" }),
    plan: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }),
    dark: L.tileLayer("https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap, © CARTO" })
  };
  const labels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, pane: "shadowPane" });
  let current = bases[baseName].addTo(map); if (baseName === "sat") labels.addTo(map);
  $$(".basemaps button").forEach(b => b.onclick = () => {
    const k = b.dataset.bm; if (k === baseName) return;
    map.removeLayer(current); if (map.hasLayer(labels)) map.removeLayer(labels);
    baseName = k; current = bases[k].addTo(map); if (k === "sat") labels.addTo(map);
    $$(".basemaps button").forEach(x => x.classList.toggle("on", x === b));
  });
  markersLayer = L.layerGroup().addTo(map);

  function markerFor(s, lat, lon) {
    const ok = isDone(s);
    const icon = L.divIcon({ className: "", html: `<div class="mkg ${ok ? "ok" : "no"}${s.pilot ? " pilot" : ""}"><div class="box">${PUMP_SVG}</div></div>`, iconSize: [34, 44], iconAnchor: [17, 42], tooltipAnchor: [0, -36] });
    const m = L.marker([lat, lon], { icon, keyboard: false });
    m.bindTooltip(`${esc(s.name)}<small>${esc(s.city || "")} · ${deptLabel(s.dept)} · ${esc(s.level || "—")} · ${ok ? "survey disponible" : "survey à faire"}${s.coord_source && /approx/.test(s.coord_source) ? " · position approximative" : ""}</small>`, { className: "station-tip", direction: "top", opacity: 1 });
    m.on("click", () => { location.hash = "#/station/" + s.id; });
    return m;
  }
  function refresh() {
    const list = stations.filter(stationFilter);
    const sl = $("#slist"); sl.innerHTML = "";
    markersLayer.clearLayers();
    // regroupe les stations partageant la même position (ville approximative) et les écarte en anneau
    const groups = {};
    list.forEach(s => { if (s.lat == null || s.lon == null) return; const k = s.lat.toFixed(3) + "," + s.lon.toFixed(3); (groups[k] = groups[k] || []).push(s); });
    Object.values(groups).forEach(members => members.forEach((s, i) => {
      let lat = s.lat, lon = s.lon;
      if (members.length > 1) { const ring = Math.floor(i / 8) + 1, slot = i % 8, r = 0.0045 * ring; lat += r * Math.cos(slot * Math.PI / 4); lon += r * Math.sin(slot * Math.PI / 4) * 1.06; }
      markersLayer.addLayer(markerFor(s, lat, lon));
    }));
    list.forEach(s => {
      const ok = isDone(s);
      sl.appendChild(el(`<div class="srow" data-id="${s.id}"><span class="sdot ${ok ? "g" : "r"}"></span>
        <div class="srow-main"><div class="sname">${esc(s.name)}${s.company ? `<span class="co-chip">${esc(s.company)}</span>` : ""}${s.pilot ? '<span class="co-chip" style="background:rgba(228,0,43,.25);color:#FFB3C0">Pilote</span>' : ""}</div>
        <div class="smeta">${esc(s.city || "—")} · ${deptLabel(s.dept)}${s.grp === "blanches" ? " · blanche" : ""}</div></div>
        <span class="spill ${ok ? "ok" : "no"}">${ok ? "SURVEY" : "À FAIRE"}</span><span class="lvl-sq">${esc(s.level || "—")}</span></div>`));
    });
    if (!list.length) sl.appendChild(el('<div class="empty-side">Aucune station ne correspond aux filtres.</div>'));
    $("#countLine").textContent = `${list.length} / ${stations.length}`;
    $$(".srow", sl).forEach(r => r.onclick = () => { location.hash = "#/station/" + r.dataset.id; });
  }
  refresh();
  setTimeout(() => map.invalidateSize(), 50);
}

// ---------------------------------------------------------------- liste complète
async function renderListe(view) {
  const stations = await loadStations();
  const rows = stations.filter(s => s.status === "active");
  view.innerHTML = `<div class="page">
    <div class="page-head"><div><div class="eyebrow">Réseau</div><h1 class="title">Toutes les stations<span class="n">${rows.length}</span></h1><div class="rule"></div></div><div class="grow"></div>
      ${can.edit() ? '<button class="btn primary" id="newSt">+ Nouvelle station</button>' : ""}<button class="btn" id="xls">⬇ Excel</button></div>
    <div class="card"><table class="tbl"><thead><tr><th>#</th><th>Station</th><th>Ville</th><th>Département</th><th>Niveau</th><th>Type</th><th>Survey</th><th>Compagnie</th><th>Contact</th></tr></thead><tbody>
    ${rows.map((s, i) => `<tr><td>${i + 1}</td><td><a href="#/station/${s.id}"><b>${esc(s.name)}</b></a>${s.pilot ? ' <span class="pill brand">Pilote</span>' : ""}</td><td>${esc(s.city || "—")}</td><td><span class="pill" style="background:${deptColor(s.dept)}22;color:${deptColor(s.dept)}">${deptLabel(s.dept)}</span></td><td><span class="pill lvl">${esc(s.level || "—")}</span></td><td>${s.grp === "actives" ? "Active" : "Blanche"}</td><td>${isDone(s) ? '<span class="pill ok">✓ Fiche</span>' : '<span class="pill warn">À faire</span>'}</td><td>${esc(s.company || "—")}</td><td class="small">${esc(s.contact_name || "")}${s.contact_phone ? "<br>" + esc(s.contact_phone) : ""}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  $("#xls").onclick = () => downloadXlsx("Stations_Alfa_Operations.xlsx", [["Stations", [["N°", "Station", "Ville", "Département", "Niveau", "Type", "Survey", "Compagnie", "Contact", "Téléphone", "Latitude", "Longitude"],
    ...rows.map((s, i) => [i + 1, s.name, s.city || "", deptLabel(s.dept), s.level || "", s.grp === "actives" ? "Active" : "Blanche", isDone(s) ? "Fiche disponible" : "À faire", s.company || "", s.contact_name || "", s.contact_phone || "", s.lat ?? "", s.lon ?? ""])]]]);
  if ($("#newSt")) $("#newSt").onclick = () => newStationDialog();
}

export function newStationDialog() {
  const ids = state.stations.map(s => s.id);
  const next = p => { let n = 1; while (ids.includes(p + n)) n++; return p + n; };
  modal(`<h3>Nouvelle station</h3>
    <div class="grid2"><div class="field"><label>Nom</label><input id="n_name" placeholder="Ex. SS TROU DU NORD"></div><div class="field"><label>Type</label><select id="n_grp"><option value="blanches">Blanche</option><option value="actives">Active</option></select></div>
    <div class="field"><label>Ville / localité</label><input id="n_city"></div><div class="field"><label>Département</label><select id="n_dept">${CFG.depts.map(d => `<option value="${d}">${deptLabel(d)}</option>`).join("")}</select></div>
    <div class="field"><label>Niveau</label><select id="n_level">${CFG.levels.map(l => `<option>${l}</option>`).join("")}</select></div><div class="field"><label>Projet pilote</label><select id="n_pilot"><option value="0">Non</option><option value="1">Oui</option></select></div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-close>Annuler</button><button class="btn primary" id="n_ok">Créer</button></div>`,
    { onOpen: (box, close) => {
      $("#n_ok", box).onclick = async () => {
        const name = $("#n_name", box).value.trim().toUpperCase(); if (!name) return toast("Le nom est obligatoire", true);
        const grp = $("#n_grp", box).value;
        const st = { id: next(grp === "actives" ? "A" : "B"), name, city: $("#n_city", box).value.trim().toUpperCase() || null, dept: $("#n_dept", box).value, level: $("#n_level", box).value, grp, status: "active", pilot: $("#n_pilot", box).value === "1", sort_order: 999 };
        try { await api.saveStation(st); await api.log(st.id, "station.creee", { name }); await loadStations(true); close(); toast("Station créée"); location.hash = "#/station/" + st.id; } catch (e) { toast(e.message, true); }
      };
    } });
}

// ---------------------------------------------------------------- surveys à faire
const DEPT_ORDER = ["NORD", "NORD EST", "NORD OUEST", "ARTIBONITE", "CENTRE", "OUEST", "NIPPES", "SUD", "SUD EST", "GRAND ANSE"];
async function renderAFaire(view) {
  const stations = (await loadStations()).filter(s => s.status === "active" && !isDone(s));
  const key = s => (s.pilot ? -1 : DEPT_ORDER.indexOf(s.dept));
  stations.sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name));
  let lastGroup = null, i = 0, body = "";
  for (const s of stations) {
    const g = s.pilot ? "Projet pilote" : deptLabel(s.dept);
    if (g !== lastGroup) { body += `<tr class="group"><td colspan="8">${esc(g)}</td></tr>`; lastGroup = g; }
    const bg = s.pilot ? "#FFF4E0" : deptColor(s.dept) + "12";
    body += `<tr style="background:${bg}"><td>${++i}</td><td><a href="#/station/${s.id}"><b>${esc(s.name)}</b></a></td><td>${esc(s.level || "—")}</td><td>${s.grp === "actives" ? "Active" : "Blanche"}</td><td>${deptLabel(s.dept)}</td><td>${esc(s.city || "—")}</td><td class="small">${esc(s.contact_name || "")}${s.contact_phone ? "<br>" + esc(s.contact_phone) : ""}</td><td class="small">${s.lat != null && s.coord_source === "gps" ? dms(s.lat, s.lon) : ""}${s.notes ? "<br>" + esc(s.notes) : ""}</td></tr>`;
  }
  view.innerHTML = `<div class="page"><div class="page-head"><div><div class="eyebrow">Rebranding</div><h1 class="title">Surveys à faire<span class="n">${stations.length} stations</span></h1><div class="rule"></div></div><div class="grow"></div><button class="btn" id="xls">⬇ Excel</button><button class="btn" onclick="print()">🖨 Imprimer</button></div>
    <p class="small muted" style="margin:-6px 0 14px">Cette liste se met à jour toute seule : une station disparaît dès qu'une fiche de survey lui est ajoutée. Fond ambre = projet pilote.</p>
    <div class="card"><table class="tbl"><thead><tr><th>#</th><th>Station</th><th>Niveau</th><th>Type</th><th>Département</th><th>Ville</th><th>Contact</th><th>GPS / Note</th></tr></thead><tbody>${body || '<tr><td colspan="8" class="empty">Toutes les stations ont une fiche de survey 🎉</td></tr>'}</tbody></table></div></div>`;
  $("#xls").onclick = () => downloadXlsx("Surveys_a_faire.xlsx", [["Surveys à faire", [["N°", "Station", "Niveau", "Type", "Département", "Ville / Localité", "Contact", "Téléphone", "GPS", "Note"],
    ...stations.map((s, i) => [i + 1, s.name, s.level || "", s.grp === "actives" ? "Active" : "Blanche", s.pilot ? "Projet pilote — " + deptLabel(s.dept) : deptLabel(s.dept), s.city || "", s.contact_name || "", s.contact_phone || "", s.lat != null && s.coord_source === "gps" ? dms(s.lat, s.lon) : "", s.notes || ""])]]]);
}

// ---------------------------------------------------------------- mon compte
function renderCompte(view) {
  const me = state.me;
  view.innerHTML = `<div class="page" style="max-width:560px"><div class="page-head"><div><div class="eyebrow">Utilisateur</div><h1 class="title">Mon compte</h1><div class="rule"></div></div></div>
    <div class="card"><div class="card-b">
      <div class="field"><label>E-mail</label><input value="${esc(me.email)}" disabled></div>
      <div class="field"><label>Nom affiché</label><input id="c_name" value="${esc(me.full_name || "")}"></div>
      <button class="btn" id="c_save">Enregistrer le nom</button>
      <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
      <div class="field"><label>Nouveau mot de passe</label><input type="password" id="c_pw" autocomplete="new-password"></div>
      <div class="field"><label>Confirmer</label><input type="password" id="c_pw2" autocomplete="new-password"></div>
      <button class="btn primary" id="c_pwsave">Changer le mot de passe</button>
    </div></div></div>`;
  $("#c_save").onclick = async () => { try { await api.updateMyName($("#c_name").value.trim()); toast("Nom enregistré"); renderShell(); route(); } catch (e) { toast(e.message, true); } };
  $("#c_pwsave").onclick = async () => {
    const a = $("#c_pw").value, b = $("#c_pw2").value;
    if (a.length < 8) return toast("8 caractères minimum", true); if (a !== b) return toast("Les deux mots de passe ne correspondent pas", true);
    try { await api.updatePassword(a); toast("Mot de passe changé"); $("#c_pw").value = $("#c_pw2").value = ""; } catch (e) { toast(e.message, true); }
  };
}

// ---------------------------------------------------------------- routeur
export async function route() {
  if (!state.me) { renderLogin(); return; }
  if (!$("#view")) renderShell();
  const hash = location.hash.replace(/^#/, "") || "/";
  const [path, ...rest] = hash.split("/").filter(Boolean).length ? ["/" + hash.split("/").filter(Boolean)[0], ...hash.split("/").filter(Boolean).slice(1)] : ["/"];
  const view = $("#view");
  setActiveNav(path);
  try {
    if (path === "/") await renderMap(view);
    else if (path === "/station" && rest[0]) await renderStation(view, rest[0]);
    else if (path === "/liste") await renderListe(view);
    else if (path === "/a-faire") await renderAFaire(view);
    else if (path === "/admin" && can.admin()) await renderAdmin(view);
    else if (path === "/compte") renderCompte(view);
    else if (path === "/login") { location.hash = "#/"; }
    else view.innerHTML = '<div class="page"><div class="empty">Page introuvable.</div></div>';
  } catch (e) { console.error(e); view.innerHTML = `<div class="page"><div class="warnbox">Erreur : ${esc(e.message)}</div></div>`; }
}
window.addEventListener("hashchange", route);

export async function boot() {
  // Lien de réinitialisation de mot de passe (Supabase ajoute #access_token=…&type=recovery à l'URL)
  const recovering = /type=recovery/.test(location.hash) || /error=/.test(location.hash);
  const authErr = (location.hash.match(/error_description=([^&]+)/) || [])[1];
  try {
    // Garde-fou : si le serveur ne répond pas en 20 s, on affiche l'écran de connexion au lieu de rester sur « Chargement… »
    const me = await Promise.race([api.init(), new Promise((_, rej) => setTimeout(() => rej(new Error("délai dépassé — rechargez la page")), 20000))]);
    state.me = me && me.active && me.role ? me : null;
    if (me && !(me.active && me.role)) { await api.signOut(); renderLogin("Ce compte n'est pas autorisé à utiliser l'application."); return; }
  } catch (e) { console.error(e); renderLogin("Impossible de joindre le serveur : " + e.message); return; }
  if (authErr) { renderLogin("Le lien n'est plus valide (" + decodeURIComponent(authErr.replace(/\+/g, " ")) + "). Cliquez sur « Mot de passe oublié ? » pour en recevoir un nouveau."); return; }
  if (recovering && state.me) { location.hash = "#/compte"; setTimeout(() => toast("Choisissez maintenant votre nouveau mot de passe."), 300); }
  renderShellIfNeeded(); await route();
}
function renderShellIfNeeded() { if (state.me) renderShell(); }
api.onAuthChange(me => { if (!me && state.me) { state.me = null; renderLogin("Session terminée."); } });
boot();
