import { api, state, loadStations } from "./app.js";
import { $, $$, esc, el, toast, modal, confirmDlg, fmtDateTime } from "./ui.js";
const CFG = window.APP_CONFIG;
const ROLES = { admin: "Administrateur", editeur: "Éditeur", lecteur: "Lecteur" };

export async function renderAdmin(view, tab = "users") {
  view.innerHTML = `<div class="page"><div class="page-head"><div><div class="eyebrow">Alfa Operations</div><h1 class="title">Administration</h1><div class="rule"></div></div></div>
    <div class="tabs"><button data-t="users" class="${tab === "users" ? "active" : ""}">Utilisateurs</button><button data-t="journal" class="${tab === "journal" ? "active" : ""}">Journal d'activité</button><button data-t="import" class="${tab === "import" ? "active" : ""}">Données initiales</button></div>
    <div id="adminBody"></div></div>`;
  $$(".tabs button", view).forEach(b => b.onclick = () => renderAdmin(view, b.dataset.t));
  const body = $("#adminBody", view);
  if (tab === "users") await renderUsers(body);
  else if (tab === "journal") await renderJournal(body);
  else await renderImport(body);
}

async function renderUsers(body) {
  const [users, allowed] = await Promise.all([api.listUsers(), api.listAllowed()]);
  const pending = allowed.filter(a => !users.some(u => u.email === a.email));
  body.innerHTML = `<div class="grid2" style="grid-template-columns:1.6fr 1fr">
    <div class="card"><div class="card-h">Comptes (${users.length})</div>
      <table class="tbl"><thead><tr><th>E-mail</th><th>Nom</th><th>Rôle</th><th>Actif</th><th></th></tr></thead><tbody>
      ${users.map(u => `<tr><td>${esc(u.email)}</td><td>${esc(u.full_name || "")}</td><td><select data-role="${u.id}" ${u.id === state.me.id ? "disabled" : ""}>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u.role === k ? "selected" : ""}>${v}</option>`).join("")}</select></td>
        <td><input type="checkbox" data-active="${u.id}" ${u.active ? "checked" : ""} ${u.id === state.me.id ? "disabled" : ""}></td><td><button class="btn sm" data-reset="${esc(u.email)}">Lien mot de passe</button></td></tr>`).join("")}
      </tbody></table>
      ${pending.length ? `<div class="card-h" style="border-top:1px solid var(--line)">Invités (compte pas encore créé)</div><table class="tbl"><tbody>${pending.map(a => `<tr><td>${esc(a.email)}</td><td>${esc(a.full_name || "")}</td><td>${ROLES[a.role]}</td><td><button class="btn sm danger" data-rmallowed="${esc(a.email)}">Retirer</button></td></tr>`).join("")}</tbody></table>` : ""}
    </div>
    <div class="card"><div class="card-h">Ajouter un utilisateur</div><div class="card-b">
      <div class="field"><label>E-mail</label><input type="email" id="a_email"></div>
      <div class="field"><label>Nom</label><input id="a_name"></div>
      <div class="field"><label>Rôle</label><select id="a_role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === "lecteur" ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="field"><label>Mot de passe initial</label><input id="a_pw" placeholder="8 caractères minimum"><span class="small muted">Communiquez-le à la personne ; elle pourra le changer dans « Mon compte ».</span></div>
      <button class="btn primary" id="a_ok">Créer le compte</button>
      <p class="small muted" style="margin-top:12px"><b>Lecteur</b> : consulte tout. <b>Éditeur</b> : ajoute fiches, documents, modifie les stations. <b>Administrateur</b> : gère aussi les utilisateurs.</p>
    </div></div></div>`;
  $("#a_ok", body).onclick = async () => {
    const email = $("#a_email", body).value.trim().toLowerCase(), pw = $("#a_pw", body).value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast("E-mail invalide", true);
    if (pw.length < 8) return toast("Mot de passe : 8 caractères minimum", true);
    try { await api.addUser({ email, full_name: $("#a_name", body).value.trim() || null, role: $("#a_role", body).value, password: pw }); toast("Compte créé pour " + email); renderUsers(body); }
    catch (e) { toast(e.message, true); }
  };
  $$("[data-role]", body).forEach(sel => sel.onchange = async () => { try { await api.setUserRole(sel.dataset.role, sel.value); toast("Rôle mis à jour"); } catch (e) { toast(e.message, true); } });
  $$("[data-active]", body).forEach(cb => cb.onchange = async () => { try { await api.setUserActive(cb.dataset.active, cb.checked); toast(cb.checked ? "Compte réactivé" : "Compte désactivé"); } catch (e) { toast(e.message, true); } });
  $$("[data-reset]", body).forEach(b => b.onclick = async () => { try { await api.resetPassword(b.dataset.reset); toast("Lien envoyé à " + b.dataset.reset); } catch (e) { toast(e.message, true); } });
  $$("[data-rmallowed]", body).forEach(b => b.onclick = async () => { if (await confirmDlg("Retirer l'invitation de " + b.dataset.rmallowed + " ?")) { await api.removeAllowed(b.dataset.rmallowed); renderUsers(body); } });
}

async function renderJournal(body) {
  const rows = await api.listActivity(null, 200);
  body.innerHTML = `<div class="card"><table class="tbl"><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Station</th><th>Détail</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="small">${fmtDateTime(r.created_at)}</td><td class="small">${esc(r.user_email || "")}</td><td>${esc(r.action)}</td><td>${r.station_id ? `<a href="#/station/${r.station_id}">${esc(r.station_id)}</a>` : ""}</td><td class="small">${esc(r.details?.summary || "")}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">Aucune activité.</td></tr>'}
  </tbody></table></div>`;
}

// ---------------------------------------------------------------- import initial (une seule fois)
async function renderImport(body) {
  const stations = await loadStations(true);
  body.innerHTML = `<div class="card"><div class="card-b">
    <p>Charge dans la base les données du système précédent (Réseau Stations v46) : <b>80 stations, 55 fiches de survey, 230 photos, scans et dossiers PDF</b>. À faire <b>une seule fois</b>, juste après l'installation.</p>
    <p class="small muted">Base actuelle : ${stations.length} station(s). ${stations.length ? "⚠ Des stations existent déjà : l'import ne touche pas aux stations déjà présentes." : ""}</p>
    <div class="field"><label>Dossier « seed » (choisir le dossier complet : il contient converted.json, images/ et docs/)</label><input type="file" id="imp_dir" webkitdirectory directory multiple></div>
    <button class="btn primary" id="imp_go" ${api.mode === "mock" ? "disabled" : ""}>Lancer l'import initial</button>
    <div id="imp_log" class="small" style="margin-top:12px;white-space:pre-wrap;font-family:ui-monospace,monospace;max-height:50vh;overflow:auto"></div>
  </div></div>`;
  $("#imp_go", body).onclick = async () => {
    const log = $("#imp_log", body); const say = t => { log.textContent += t + "\n"; log.scrollTop = log.scrollHeight; };
    const files = [...$("#imp_dir", body).files];
    const byName = new Map(files.map(f => [f.name, f]));
    const seedFile = byName.get("converted.json");
    if (!seedFile) return toast("Choisissez le dossier seed (il doit contenir converted.json)", true);
    $("#imp_go", body).disabled = true;
    try {
      const seed = JSON.parse(await seedFile.text());
      const existing = new Set(stations.map(s => s.id));
      let ns = 0, nf = 0, nd = 0, nerr = 0;
      for (const st of seed.stations) { if (existing.has(st.id)) continue; await api.saveStation(st); ns++; }
      say(`Stations : ${ns} ajoutée(s).`);
      for (const f of seed.fiches) { if (existing.has(f.station_id)) continue; await api.saveFiche({ ...f, created_by: state.me.id }); nf++; }
      say(`Fiches : ${nf} ajoutée(s).`);
      for (const d of seed.documents) {
        if (existing.has(d.station_id)) continue;
        const fname = d.local.split("/").pop();
        const file = byName.get(fname);
        if (!file) { nerr++; say(`  ✗ fichier absent du dossier : ${fname}`); continue; }
        try { await api.uploadDocument(d.station_id, new File([file], d.file_name || fname, { type: d.mime || file.type }), d.kind, d.caption); nd++; if (nd % 10 === 0) say(`Documents : ${nd}/${seed.documents.length}…`); }
        catch (e) { nerr++; say(`  ✗ ${fname} : ${e.message}`); }
      }
      say(`Documents : ${nd} envoyé(s), ${nerr} erreur(s).`);
      await api.log(null, "import", { summary: `${ns} stations, ${nf} fiches, ${nd} documents` });
      await loadStations(true); say("Terminé ✓");
    } catch (e) { say("ERREUR : " + e.message); }
  };
}
