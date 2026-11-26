import { api, state, can, surveyLabel, deptColor, loadStations } from "./app.js";
import { $, $$, esc, el, toast, modal, confirmDlg, lightbox, fmtDate, fmtDateTime, deptLabel, dms, parseCoords } from "./ui.js";
const CFG = window.APP_CONFIG;

// ---------------------------------------------------------------- rendu d'une fiche (sections)
function renderSections(sections) {
  return (sections || []).map(sec => {
    let body = "";
    if (sec.note) body += `<div class="note" style="margin:10px 14px">${esc(sec.note)}</div>`;
    if (sec.fields && sec.fields.length) body += `<div class="fields">${sec.fields.map(([k, v]) => `<div class="f"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join("")}</div>`;
    if (sec.table) body += `<div style="overflow:auto;padding:0 14px 10px"><table class="tbl"><thead><tr>${(sec.table.head || []).map(h => `<th style="position:static">${esc(h)}</th>`).join("")}</tr></thead><tbody>${(sec.table.rows || []).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    return `<div class="sec card"><div class="sec-h">${esc(sec.title || "")}</div><div class="sec-b">${body}</div></div>`;
  }).join("");
}

// ---------------------------------------------------------------- page station
export async function renderStation(view, id) {
  const [s, fiches, docs, hist] = await Promise.all([api.getStation(id), api.listFiches(id), api.listDocuments(id), api.listActivity(id, 30)]);
  if (!s) { view.innerHTML = '<div class="page"><div class="empty">Station introuvable.</div></div>'; return; }
  const urls = await api.docUrls(docs);
  const images = docs.filter(d => /^image\//.test(d.mime || "") || d.kind === "photo" || d.kind === "scan");
  const files = docs.filter(d => !images.includes(d));
  const ap = s.approved;
  const edit = can.edit();
  view.innerHTML = `<div class="page">
    <div class="st-hero">
      <div class="mh-badges"><span class="mh-badge">${deptLabel(s.dept)}</span><span class="mh-badge">Niveau ${esc(s.level || "—")}</span><span class="mh-badge">${s.grp === "actives" ? "Station active" : "Station blanche"}</span>${s.pilot ? '<span class="mh-badge red">Projet pilote</span>' : ""}${s.status === "retiree" ? '<span class="mh-badge" style="background:#7A1E12">Retirée du projet</span>' : ""}<span class="mh-badge ${fiches.length ? "ok" : "no"}">${fiches.length ? "✓ Survey disponible" : "Survey à faire"}</span></div>
      <h1>${esc(s.name)}</h1>
      <div class="meta">${esc(s.city || "Ville non renseignée")} · ${s.lat != null ? dms(s.lat, s.lon) + (s.coord_source && /approx/.test(s.coord_source) ? " (approximatif)" : "") : "GPS non renseigné"} · ID ${esc(s.id)}</div>
      <div class="actions">${edit ? `<button class="btn primary" id="b_fiche">+ Fiche de survey</button><button class="btn" id="b_doc">+ Photos / documents</button><button class="btn" id="b_edit">✎ Modifier la station</button>` : ""}<a class="btn" href="#/">← Carte</a></div>
    </div>
    <div class="grid2">
      <div class="card"><div class="card-h">Informations<span class="grow"></span>${fiches.length ? '<span class="pill ok">Survey disponible</span>' : '<span class="pill warn">Survey à faire</span>'}</div>
        <div class="kv">
          <div class="cell"><div class="k">Contact</div><div class="v">${esc(s.contact_name || "—")}</div></div>
          <div class="cell"><div class="k">Téléphone</div><div class="v">${s.contact_phone ? `<a href="tel:${esc(s.contact_phone)}">${esc(s.contact_phone)}</a>` : "—"}</div></div>
          <div class="cell"><div class="k">Adresse</div><div class="v">${esc(s.address || "—")}</div></div>
          <div class="cell"><div class="k">Coordonnées GPS</div><div class="v">${s.lat != null ? `${s.lat.toFixed(6)}, ${s.lon.toFixed(6)} <a class="small" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${s.lat},${s.lon}">Google Maps ↗</a>` : "—"}</div></div>
          <div class="cell"><div class="k">Compagnie de remodelage</div><div class="v">${esc(s.company || "Non assignée")}</div></div>
          <div class="cell"><div class="k">Survey</div><div class="v">${esc(surveyLabel(s.survey_code))}</div></div>
          <div class="cell" style="grid-column:1/-1"><div class="k">Notes</div><div class="v" style="font-weight:500;white-space:pre-wrap">${esc(s.notes || "—")}</div></div>
        </div></div>
      <div class="card"><div class="card-h">Branding approuvé — première vague</div>
        ${ap ? `<div class="kv"><div class="cell"><div class="k">Marque cible</div><div class="v">${esc(ap.brand)}</div></div><div class="cell"><div class="k">Niveau approuvé</div><div class="v">${esc(ap.lvl)}</div></div><div class="cell"><div class="k">Type de canopée</div><div class="v">${esc(ap.canopy)}</div></div><div class="cell"><div class="k">Fabricant assigné</div><div class="v">${esc(ap.supplier === "NN" ? "Neon Nieto" : ap.supplier)}</div></div></div>` : '<div class="empty small">Station absente de la liste « Branding Approuvés » (première vague).</div>'}
        <div class="card-h" style="border-top:1px solid var(--line)">Historique récent</div>
        <div class="hist">${hist.length ? hist.slice(0, 8).map(h => `<div class="h"><b>${esc(actionLabel(h.action))}</b> ${esc(h.details?.summary || "")}<div class="when">${fmtDateTime(h.created_at)} · ${esc(h.user_email || "")}</div></div>`).join("") : '<div class="empty small">Aucune activité.</div>'}</div>
      </div>
    </div>

    <h2 class="h2sec">Photos, scans et documents <span class="muted">(${docs.length})</span></h2>
    <div class="card">
      ${images.length ? `<div class="gallery">${images.map(d => `<div class="g" data-id="${d.id}"><img src="${esc(urls[d.id] || "")}" alt="${esc(d.caption || d.file_name || "")}" loading="lazy"><div class="cap">${esc(d.caption || d.file_name || "")}</div>${edit ? `<button class="del" title="Supprimer" data-del="${d.id}">✕</button>` : ""}</div>`).join("")}</div>` : ""}
      ${files.length ? `<div class="doclist">${files.map(d => `<div class="d"><div class="ic">${/xls/.test(d.mime || d.file_name || "") ? "XLS" : "PDF"}</div><div class="grow"><div class="nm">${esc(d.caption || d.file_name)}</div><div class="small muted">${esc(d.file_name || "")} · ${fmtDate(d.created_at)}</div></div><a class="btn sm" target="_blank" rel="noopener" href="${esc(urls[d.id] || "#")}">Ouvrir</a>${edit ? `<button class="btn sm danger" data-del="${d.id}">Supprimer</button>` : ""}</div>`).join("")}</div>` : ""}
      ${!docs.length ? '<div class="empty">Aucun document pour cette station.</div>' : ""}
    </div>

    <h2 class="h2sec">Fiche de survey</h2>
    ${fiches.length ? fiches.map(f => `<div class="card" style="margin-bottom:14px"><div class="card-h"><span>${esc(f.title || "Fiche de survey")}</span><span class="pill ${f.is_current ? "ok" : ""}">${f.is_current ? "En vigueur" : "Archivée"}</span><span class="grow"></span><span class="small muted" style="text-transform:none;letter-spacing:0">Source : ${esc(f.source_file || "—")} · ${fmtDate(f.source_date)}</span>${edit ? `<button class="btn sm" data-fedit="${f.id}">✎ Modifier</button><button class="btn sm danger" data-fdel="${f.id}">Supprimer</button>` : ""}</div><div class="card-b" style="padding:12px">${renderSections(f.sections)}</div></div>`).join("")
      : `<div class="card"><div class="empty">Aucune fiche de survey pour cette station.${edit ? "<br><br><button class='btn primary' id='b_fiche2'>+ Ajouter la fiche de survey</button>" : ""}</div></div>`}
  </div>`;

  $$(".gallery .g img").forEach(im => im.onclick = () => lightbox(im.src));
  if (edit) {
    $("#b_edit").onclick = () => editStationDialog(s);
    const addF = () => ficheEditor(s, null);
    $("#b_fiche").onclick = addF; if ($("#b_fiche2")) $("#b_fiche2").onclick = addF;
    $("#b_doc").onclick = () => uploadDialog(s);
    $$("[data-fedit]").forEach(b => b.onclick = () => ficheEditor(s, fiches.find(f => f.id === b.dataset.fedit)));
    $$("[data-fdel]").forEach(b => b.onclick = async () => { if (await confirmDlg("Supprimer cette fiche de survey ? Cette action est définitive.")) { await api.deleteFiche(b.dataset.fdel); await api.log(s.id, "fiche.supprimee", { summary: "fiche supprimée" }); await loadStations(true); toast("Fiche supprimée"); renderStation(view, id); } });
    $$("[data-del]").forEach(b => b.onclick = async e => { e.stopPropagation(); const d = docs.find(x => x.id === b.dataset.del); if (await confirmDlg(`Supprimer « ${d.caption || d.file_name} » ?`)) { await api.deleteDocument(d); await api.log(s.id, "document.supprime", { summary: d.file_name }); toast("Document supprimé"); renderStation(view, id); } });
  }
}
function actionLabel(a) { return ({ "station.modifiee": "Station modifiée", "station.creee": "Station créée", "fiche.ajoutee": "Fiche ajoutée", "fiche.modifiee": "Fiche modifiée", "fiche.supprimee": "Fiche supprimée", "document.ajoute": "Document ajouté", "document.supprime": "Document supprimé", "import": "Import initial" }[a] || a); }

// ---------------------------------------------------------------- modifier la station
function editStationDialog(s) {
  const companies = [...new Set([...CFG.companies, s.company].filter(Boolean))];
  modal(`<h3>Modifier — ${esc(s.name)}</h3>
    <div class="grid2">
      <div class="field"><label>Nom</label><input id="e_name" value="${esc(s.name)}"></div>
      <div class="field"><label>Ville / localité</label><input id="e_city" value="${esc(s.city || "")}"></div>
      <div class="field"><label>Département</label><select id="e_dept">${CFG.depts.map(d => `<option value="${d}" ${s.dept === d ? "selected" : ""}>${deptLabel(d)}</option>`).join("")}</select></div>
      <div class="field"><label>Niveau</label><select id="e_level">${CFG.levels.map(l => `<option ${(s.level || "—") === l ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label>Type</label><select id="e_grp"><option value="actives" ${s.grp === "actives" ? "selected" : ""}>Active</option><option value="blanches" ${s.grp === "blanches" ? "selected" : ""}>Blanche</option></select></div>
      <div class="field"><label>Projet pilote</label><select id="e_pilot"><option value="0">Non</option><option value="1" ${s.pilot ? "selected" : ""}>Oui</option></select></div>
      <div class="field"><label>Contact (nom)</label><input id="e_cn" value="${esc(s.contact_name || "")}"></div>
      <div class="field"><label>Téléphone</label><input id="e_cp" value="${esc(s.contact_phone || "")}"></div>
      <div class="field" style="grid-column:1/-1"><label>Adresse</label><input id="e_addr" value="${esc(s.address || "")}"></div>
      <div class="field" style="grid-column:1/-1"><label>Coordonnées GPS (décimal « 19.69, -72.14 » ou DMS « 19°41'35.4"N 72°10'49.2"W »)</label><input id="e_gps" value="${s.lat != null ? s.lat + ", " + s.lon : ""}"><span class="small muted">${s.coord_source ? "Source actuelle : " + esc(s.coord_source) : ""}</span></div>
      <div class="field"><label>Compagnie de remodelage</label><select id="e_co"><option value="">— Non assignée —</option>${companies.map(c => `<option ${s.company === c ? "selected" : ""}>${esc(c)}</option>`).join("")}<option value="__autre">Autre…</option></select></div>
      <div class="field"><label>Code survey</label><select id="e_sc"><option value="">—</option>${Object.entries(CFG.surveyCodes).map(([k, v]) => `<option value="${k}" ${s.survey_code === k ? "selected" : ""}>${k} — ${esc(v)}</option>`).join("")}</select></div>
      <div class="field"><label>Statut</label><select id="e_status"><option value="active" ${s.status === "active" ? "selected" : ""}>Dans le projet</option><option value="retiree" ${s.status === "retiree" ? "selected" : ""}>Retirée du projet</option></select></div>
      <div class="field" style="grid-column:1/-1"><label>Notes</label><textarea id="e_notes">${esc(s.notes || "")}</textarea></div>
    </div>
    <div class="row" style="justify-content:space-between"><div>${can.admin() ? '<button class="btn danger" id="e_del">Supprimer définitivement</button>' : ""}</div><div class="row"><button class="btn" data-close>Annuler</button><button class="btn primary" id="e_ok">Enregistrer</button></div></div>`,
    { onOpen: (box, close) => {
      $("#e_co", box).onchange = e => { if (e.target.value === "__autre") { const v = prompt("Nom de la compagnie :"); if (v) { const o = document.createElement("option"); o.textContent = v; e.target.insertBefore(o, e.target.lastElementChild); o.selected = true; } else e.target.value = ""; } };
      $("#e_ok", box).onclick = async () => {
        const gpsTxt = $("#e_gps", box).value.trim(); let lat = s.lat, lon = s.lon, src = s.coord_source;
        if (gpsTxt) { const c = parseCoords(gpsTxt); if (!c) return toast("Coordonnées GPS illisibles", true); if (c[0] !== s.lat || c[1] !== s.lon) { [lat, lon] = c; src = "gps"; } } else { lat = lon = null; src = null; }
        const row = { ...s, name: $("#e_name", box).value.trim().toUpperCase(), city: $("#e_city", box).value.trim().toUpperCase() || null, dept: $("#e_dept", box).value, level: $("#e_level", box).value, grp: $("#e_grp", box).value, pilot: $("#e_pilot", box).value === "1",
          contact_name: $("#e_cn", box).value.trim() || null, contact_phone: $("#e_cp", box).value.trim() || null, address: $("#e_addr", box).value.trim() || null, lat, lon, coord_source: src,
          company: $("#e_co", box).value === "__autre" ? null : ($("#e_co", box).value || null), survey_code: $("#e_sc", box).value || null, status: $("#e_status", box).value, notes: $("#e_notes", box).value.trim() || null };
        try {
          await api.saveStation(row);
          const changed = Object.keys(row).filter(k => JSON.stringify(row[k]) !== JSON.stringify(s[k]) && !["updated_at", "updated_by"].includes(k));
          await api.log(s.id, "station.modifiee", { summary: changed.join(", "), changed });
          await loadStations(true); close(); toast("Station enregistrée"); location.hash = "#/station/" + s.id; window.dispatchEvent(new HashChangeEvent("hashchange"));
        } catch (e) { toast(e.message, true); }
      };
      if ($("#e_del", box)) $("#e_del", box).onclick = async () => { if (await confirmDlg(`Supprimer définitivement ${s.name}, sa fiche et ses documents ? Préférez « Retirée du projet » pour garder l'historique.`, "Supprimer")) { await api.deleteStation(s.id); await loadStations(true); close(); toast("Station supprimée"); location.hash = "#/liste"; } };
    } });
}

// ---------------------------------------------------------------- envoi de documents
function uploadDialog(s) {
  modal(`<h3>Ajouter des photos / documents — ${esc(s.name)}</h3>
    <div class="field"><label>Fichiers (photos JPG/PNG, PDF, Excel)</label><input type="file" id="u_files" multiple accept="image/*,.pdf,.xls,.xlsx"></div>
    <div class="grid2"><div class="field"><label>Type</label><select id="u_kind"><option value="photo">Photo du site</option><option value="scan">Scan de fiche de survey</option><option value="pdf">Dossier de survey (PDF / Excel)</option><option value="autre">Autre</option></select></div><div class="field"><label>Légende (optionnel)</label><input id="u_cap"></div></div>
    <div id="u_prog" class="small muted"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-close>Annuler</button><button class="btn primary" id="u_ok">Envoyer</button></div>`,
    { onOpen: (box, close) => {
      $("#u_ok", box).onclick = async () => {
        const files = [...$("#u_files", box).files]; if (!files.length) return toast("Choisissez au moins un fichier", true);
        $("#u_ok", box).disabled = true; let n = 0;
        for (const f of files) {
          $("#u_prog", box).textContent = `Envoi ${++n}/${files.length} : ${f.name}…`;
          try { const kind = $("#u_kind", box).value === "photo" && /pdf|excel|sheet/.test(f.type) ? "pdf" : $("#u_kind", box).value; await api.uploadDocument(s.id, f, kind, $("#u_cap", box).value.trim() || null); await api.log(s.id, "document.ajoute", { summary: f.name }); }
          catch (e) { toast("Échec : " + f.name + " — " + e.message, true); }
        }
        close(); toast(`${n} fichier(s) envoyé(s)`); window.dispatchEvent(new HashChangeEvent("hashchange"));
      };
    } });
}

// ---------------------------------------------------------------- éditeur de fiche
const TEMPLATE_INTERNE = () => [
  { title: "Survey interne — Zone", note: "Fiche standard du service. Date du relevé : … Surveyor : …" },
  { title: "Localisation", fields: [["Coordonnées GPS (fiche)", ""], ["Position retenue sur la carte", ""]] },
  { title: "Canopée", fields: [["Longueur", ""], ["Largeur", ""], ["Bandeau / fascia (hauteur)", ""], ["Colonnes (L × l × H)", ""], ["Habillage des colonnes", ""], ["Lampes LED", ""], ["Quantité de lampes", ""]] },
  { title: "Bâtiment", fields: [["Longueur", ""], ["Largeur", ""], ["Hauteur", ""]] },
  { title: "Totem", fields: [["Totem existant", "Pas de totem / 6,5 m / 9 m / bipod"]] },
  { title: "Volucompteurs", fields: [["Quantité", ""], ["Nombre de pistolets", ""], ["Modèles", "Encore 300 / Encore 500 / Performer / Legacy"]] },
  { title: "Terrain", fields: [["Longueur", ""], ["Largeur", ""]] },
  { title: "Observations (fiche)", note: "" },
  { title: "Remarques / à vérifier", note: "" }
];
function ficheEditor(s, fiche) {
  const f = fiche ? JSON.parse(JSON.stringify(fiche)) : { station_id: s.id, title: "Fiche de survey", source_file: "", source_date: new Date().toISOString().slice(0, 10), sections: [], is_current: true };
  const secHtml = (sec, i) => `<div class="sec-ed" data-i="${i}">
      <div class="st"><input class="s_title" placeholder="Titre de la section (ex. Canopée)" value="${esc(sec.title || "")}"><button class="btn sm" data-up title="Monter">↑</button><button class="btn sm" data-down title="Descendre">↓</button><button class="btn sm danger" data-rm>✕</button></div>
      <textarea class="s_note" placeholder="Note libre (optionnel)" rows="2">${esc(sec.note || "")}</textarea>
      <div class="rows">${(sec.fields || []).map(([k, v]) => `<div class="trow"><input class="fk" placeholder="Libellé" value="${esc(k)}"><input class="fv" placeholder="Valeur" value="${esc(v)}"><button class="btn sm" data-rmrow>✕</button></div>`).join("")}</div>
      <button class="btn sm" data-addrow>+ Ligne</button></div>`;
  modal(`<h3>${fiche ? "Modifier la fiche" : "Nouvelle fiche de survey"} — ${esc(s.name)}</h3>
    <div class="grid3"><div class="field"><label>Titre</label><input id="f_title" value="${esc(f.title || "")}"></div><div class="field"><label>Source (fichier / origine)</label><input id="f_src" value="${esc(f.source_file || "")}" placeholder="Ex. Fiche interne Zone Nord"></div><div class="field"><label>Date du survey</label><input type="date" id="f_date" value="${esc(f.source_date || "")}"></div></div>
    <div class="row" style="margin-bottom:10px"><button class="btn sm" id="f_tpl">Utiliser le modèle « fiche interne » (canopée, bâtiment, totem, volus, terrain)</button><button class="btn sm" id="f_addsec">+ Section</button><label class="small" style="margin-left:auto"><input type="checkbox" id="f_cur" ${f.is_current ? "checked" : ""}> Fiche en vigueur</label></div>
    <div class="fed" id="f_secs">${f.sections.map(secHtml).join("")}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-close>Annuler</button><button class="btn primary" id="f_ok">Enregistrer la fiche</button></div>`,
    { onOpen: (box, close) => {
      const secs = $("#f_secs", box);
      const wire = () => {
        $$(".sec-ed", secs).forEach(se => {
          $("[data-rm]", se).onclick = () => se.remove();
          $("[data-up]", se).onclick = () => se.previousElementSibling && secs.insertBefore(se, se.previousElementSibling);
          $("[data-down]", se).onclick = () => se.nextElementSibling && secs.insertBefore(se.nextElementSibling, se);
          $("[data-addrow]", se).onclick = () => { $(".rows", se).appendChild(el(`<div class="trow"><input class="fk" placeholder="Libellé"><input class="fv" placeholder="Valeur"><button class="btn sm" data-rmrow>✕</button></div>`)); wireRows(se); };
          wireRows(se);
        });
      };
      const wireRows = se => $$("[data-rmrow]", se).forEach(b => b.onclick = () => b.parentElement.remove());
      wire();
      $("#f_addsec", box).onclick = () => { secs.appendChild(el(secHtml({ title: "", fields: [["", ""]] }, 0))); wire(); };
      $("#f_tpl", box).onclick = () => { TEMPLATE_INTERNE().forEach(sec => secs.appendChild(el(secHtml(sec, 0)))); if (!$("#f_src", box).value) $("#f_src", box).value = "Fiche de survey interne"; wire(); };
      $("#f_ok", box).onclick = async () => {
        const sections = $$(".sec-ed", secs).map(se => {
          const o = { title: $(".s_title", se).value.trim() };
          const note = $(".s_note", se).value.trim(); if (note) o.note = note;
          const fields = $$(".trow", se).map(r => [$(".fk", r).value.trim(), $(".fv", r).value.trim()]).filter(([k, v]) => k || v);
          if (fields.length) o.fields = fields;
          return o;
        }).filter(o => o.title || o.note || o.fields);
        if (!sections.length) return toast("Ajoutez au moins une section ou une mesure", true);
        const row = { ...f, title: $("#f_title", box).value.trim() || "Fiche de survey", source_file: $("#f_src", box).value.trim() || null, source_date: $("#f_date", box).value || null, sections, is_current: $("#f_cur", box).checked };
        if (!row.id) { delete row.id; row.created_by = state.me.id; }
        try { await api.saveFiche(row); await api.log(s.id, fiche ? "fiche.modifiee" : "fiche.ajoutee", { summary: row.title }); await loadStations(true); close(); toast("Fiche enregistrée"); window.dispatchEvent(new HashChangeEvent("hashchange")); }
        catch (e) { toast(e.message, true); }
      };
    } });
}
