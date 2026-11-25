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
  return state.stations;
}
export const isDone = s => !!s.has_fiche;

// ---------------------------------------------------------------- coquille
function renderShell() {
  const app = $("#app");
  const me = state.me;
  app.innerHTML = `
  <header class="topbar">
    <button class="burger" id="burger" aria-label="Menu">☰</button>
    <a class="brand" href="#/"><span class="logo">A</span><span>${esc(CFG.appName)}<small>${esc(CFG.company)} · suivi des surveys</small></span></a>
    <nav id="nav">
      <a href="#/" data-r="/">Carte</a>
      <a href="#/liste" data-r="/liste">Stations</a>
      <a href="#/a-faire" data-r="/a-faire">Surveys à faire</a>
      ${can.admin() ? '<a href="#/admin" data-r="/admin">Administration</a>' : ""}
    </nav>
    <div class="spacer"></div>
    <div class="user"><span class="nm"><b>${esc(me.full_name || me.email)}</b></span><span class="role">${esc(me.role)}</span>
      <a href="#/compte" class="btn sm ghost" style="color:#fff">Mon compte</a>
      <button class="btn sm ghost" id="logout" style="color:#fff">Déconnexion</button></div>
  </header>
  <main id="view"></main>`;
  $("#logout").onclick = async () => { await api.signOut(); state.me = null; location.hash = "#/login"; };
  $("#burger").onclick = () => $("#nav").classList.toggle("open");
}
function setActiveNav(path) {
  $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.r === "/" ? path === "/" : path.startsWith(a.dataset.r)));
  $("#nav")?.classList.remove("open");
}

// ---------------------------------------------------------------- login
function renderLogin(msg) {
  $("#app").innerHTML = `
  <div class="login"><form class="box" id="loginForm">
    <div class="row" style="margin-bottom:14px"><span class="logo" style="width:36px;height:36px;border-radius:9px;background:var(--brand);color:#fff;display:grid;place-items:center;font-weight:800">A</span><div><h1>${esc(CFG.appName)}</h1><p class="sub" style="margin:0">${esc(CFG.company)} · Suivi des surveys et du rebranding</p></div></div>
    ${msg ? `<div class="warnbox" style="margin-bottom:12px">${esc(msg)}</div>` : ""}
    <div class="field"><label>E-mail</label><input type="email" id="email" autocomplete="username" required></div>
    <div class="field"><label>Mot de passe</label><input type="password" id="pw" autocomplete="current-password" required></div>
    <div class="err" id="err" hidden></div>
    <button class="btn primary" style="width:100%;justify-content:center" type="submit">Se connecter</button>
    <p class="small muted" style="margin:14px 0 0"><a href="#" id="forgot">Mot de passe oublié ?</a>${api.mode === "mock" ? " · <span>Mode essai : admin@alfa.ht / demo</span>" : ""}</p>
  </form></div>`;
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
async function renderMap(view) {
  const stations = (await loadStations()).filter(s => s.status === "active");
  const done = stations.filter(isDone).length;
  const companies = [...new Set([...CFG.companies, ...stations.map(s => s.company).filter(Boolean)])];
  view.innerHTML = `<div class="page wide"><div class="mapwrap">
    <aside class="side">
      <div class="kpis"><div><b>${stations.length}</b><span>Stations</span></div><div><b>${done}</b><span>Avec survey</span></div><div><b>${stations.length - done}</b><span>Restantes</span></div></div>
      <div class="filters">
        <input class="full" id="fq" placeholder="Rechercher une station…" value="${esc(state.filters.q)}">
        <select id="fdept"><option value="">Tous départements</option>${CFG.depts.map(d => `<option value="${d}" ${state.filters.dept === d ? "selected" : ""}>${deptLabel(d)}</option>`).join("")}</select>
        <select id="flevel"><option value="">Tous niveaux</option>${CFG.levels.map(l => `<option ${state.filters.level === l ? "selected" : ""}>${l}</option>`).join("")}</select>
        <select id="fgrp"><option value="">Actives + blanches</option><option value="actives" ${state.filters.grp === "actives" ? "selected" : ""}>Actives</option><option value="blanches" ${state.filters.grp === "blanches" ? "selected" : ""}>Blanches</option></select>
        <select id="fsurvey"><option value="">Survey : tous</option><option value="done" ${state.filters.survey === "done" ? "selected" : ""}>Avec survey</option><option value="todo" ${state.filters.survey === "todo" ? "selected" : ""}>Sans survey</option></select>
        <select class="full" id="fcompany"><option value="">Toutes compagnies</option>${companies.map(c => `<option ${state.filters.company === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      </div>
      <div class="list" id="slist"></div>
    </aside>
    <div id="map"></div></div></div>`;
  const bind = (id, key) => { $(id).oninput = e => { state.filters[key] = e.target.value; refresh(); }; };
  bind("#fq", "q"); bind("#fdept", "dept"); bind("#flevel", "level"); bind("#fgrp", "grp"); bind("#fsurvey", "survey"); bind("#fcompany", "company");

  map = L.map("map", { zoomControl: true }).setView([19.0, -72.8], 8);
  const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Esri" });
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
  const lbl = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 });
  sat.addTo(map); lbl.addTo(map);
  L.control.layers({ "Satellite": sat, "Plan": osm }, { "Noms de lieux": lbl }, { position: "bottomright" }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);

  function refresh() {
    const list = stations.filter(stationFilter);
    const sl = $("#slist"); sl.innerHTML = "";
    markersLayer.clearLayers();
    list.forEach(s => {
      const ok = isDone(s);
      sl.appendChild(el(`<div class="srow" data-id="${s.id}"><span class="dot" style="background:${deptColor(s.dept)}"></span>
        <div class="grow"><div class="nm">${esc(s.name)}</div><div class="sub">${esc(s.city || "—")} · ${deptLabel(s.dept)} · ${esc(s.level || "—")}${s.pilot ? " · Pilote" : ""}</div></div>
        <span class="pill ${ok ? "ok" : "warn"}">${ok ? "Survey ✓" : "À faire"}</span></div>`));
      if (s.lat != null && s.lon != null) {
        const m = L.circleMarker([s.lat, s.lon], { radius: 8, color: ok ? "#fff" : "#c62828", weight: 2, fillColor: deptColor(s.dept), fillOpacity: ok ? .95 : .55 });
        m.bindPopup(`<b>${esc(s.name)}</b><br>${esc(s.city || "")} · ${deptLabel(s.dept)} · ${esc(s.level || "—")}<br>${ok ? "✓ Survey disponible" : "⚠ Survey à faire"}${s.coord_source && /approx/.test(s.coord_source) ? "<br><i>position approximative (ville)</i>" : ""}<br><a href="#/station/${s.id}">Ouvrir la fiche →</a>`);
        m.on("click", () => m.openPopup());
        markersLayer.addLayer(m);
      }
    });
    sl.appendChild(el(`<div class="empty small">${list.length} station(s) affichée(s)</div>`));
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
    <div class="row" style="margin-bottom:14px"><h1 style="font-size:22px">Toutes les stations <span class="muted" style="font-size:15px;font-weight:500">(${rows.length})</span></h1><div class="spacer" style="flex:1"></div>
      ${can.edit() ? '<button class="btn" id="newSt">+ Nouvelle station</button>' : ""}<button class="btn" id="xls">⬇ Excel</button></div>
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
    const bg = s.pilot ? "#fff7cc" : deptColor(s.dept) + "14";
    body += `<tr style="background:${bg}"><td>${++i}</td><td><a href="#/station/${s.id}"><b>${esc(s.name)}</b></a></td><td>${esc(s.level || "—")}</td><td>${s.grp === "actives" ? "Active" : "Blanche"}</td><td>${deptLabel(s.dept)}</td><td>${esc(s.city || "—")}</td><td class="small">${esc(s.contact_name || "")}${s.contact_phone ? "<br>" + esc(s.contact_phone) : ""}</td><td class="small">${s.lat != null && s.coord_source === "gps" ? dms(s.lat, s.lon) : ""}${s.notes ? "<br>" + esc(s.notes) : ""}</td></tr>`;
  }
  view.innerHTML = `<div class="page"><div class="row" style="margin-bottom:14px"><h1 style="font-size:22px">Surveys à faire <span class="muted" style="font-size:15px;font-weight:500">(${stations.length} stations)</span></h1><div style="flex:1"></div><button class="btn" id="xls">⬇ Excel</button><button class="btn" onclick="print()">🖨 Imprimer</button></div>
    <p class="small muted">Cette liste se met à jour toute seule : une station disparaît dès qu'une fiche de survey lui est ajoutée. Jaune = projet pilote.</p>
    <div class="card"><table class="tbl"><thead><tr><th>#</th><th>Station</th><th>Niveau</th><th>Type</th><th>Département</th><th>Ville</th><th>Contact</th><th>GPS / Note</th></tr></thead><tbody>${body || '<tr><td colspan="8" class="empty">Toutes les stations ont une fiche de survey 🎉</td></tr>'}</tbody></table></div></div>`;
  $("#xls").onclick = () => downloadXlsx("Surveys_a_faire.xlsx", [["Surveys à faire", [["N°", "Station", "Niveau", "Type", "Département", "Ville / Localité", "Contact", "Téléphone", "GPS", "Note"],
    ...stations.map((s, i) => [i + 1, s.name, s.level || "", s.grp === "actives" ? "Active" : "Blanche", s.pilot ? "Projet pilote — " + deptLabel(s.dept) : deptLabel(s.dept), s.city || "", s.contact_name || "", s.contact_phone || "", s.lat != null && s.coord_source === "gps" ? dms(s.lat, s.lon) : "", s.notes || ""])]]]);
}

// ---------------------------------------------------------------- mon compte
function renderCompte(view) {
  const me = state.me;
  view.innerHTML = `<div class="page" style="max-width:560px"><h1 style="font-size:22px;margin-bottom:14px">Mon compte</h1>
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
