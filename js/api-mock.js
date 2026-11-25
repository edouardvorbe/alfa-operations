// Adaptateur de données — mode "mock" (essai local, aucune base). Données d'essai : seed/converted.json
export function createMockApi(cfg) {
  let me = null, data = null, nextId = 1;
  const uid = () => "m" + (nextId++);
  const USERS = [
    { id: "u1", email: "admin@alfa.ht", full_name: "Admin Démo", role: "admin", active: true },
    { id: "u2", email: "editeur@alfa.ht", full_name: "Éditeur Démo", role: "editeur", active: true },
    { id: "u3", email: "lecteur@alfa.ht", full_name: "Lecteur Démo", role: "lecteur", active: true }
  ];
  const activity = [];
  async function load() {
    if (data) return data;
    const r = await fetch("seed/converted.json");
    const j = await r.json();
    data = {
      stations: j.stations,
      fiches: j.fiches.map(f => ({ ...f, id: uid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() })),
      documents: j.documents.map(d => ({ ...d, id: uid(), storage_path: d.local, created_at: new Date().toISOString() })),
      settings: {}
    };
    return data;
  }
  const overview = s => ({ ...s, has_fiche: data.fiches.some(f => f.station_id === s.id && f.is_current), n_docs: data.documents.filter(d => d.station_id === s.id).length });
  return {
    mode: "mock",
    async init() { await load(); try { me = JSON.parse(sessionStorage.getItem("mockMe") || "null"); } catch { me = null; } return me; },
    onAuthChange() {},
    me() { return me; },
    async signIn(email, password) {
      const u = USERS.find(u => u.email === email.trim().toLowerCase());
      if (!u || password !== "demo") throw new Error("E-mail ou mot de passe incorrect (mode essai : mot de passe « demo »)");
      me = { ...u }; sessionStorage.setItem("mockMe", JSON.stringify(me)); return me;
    },
    async signOut() { me = null; sessionStorage.removeItem("mockMe"); },
    async resetPassword() {}, async updatePassword() {}, async updateMyName(n) { me.full_name = n; },
    async listStations() { await load(); return data.stations.map(overview); },
    async getStation(id) { await load(); const s = data.stations.find(s => s.id === id); return s ? overview(s) : null; },
    async saveStation(st) { await load(); const i = data.stations.findIndex(s => s.id === st.id); const row = { ...st, updated_at: new Date().toISOString() }; delete row.has_fiche; delete row.n_docs; if (i >= 0) data.stations[i] = row; else data.stations.push(row); return row; },
    async deleteStation(id) { data.stations = data.stations.filter(s => s.id !== id); },
    async listFiches(id) { await load(); return data.fiches.filter(f => f.station_id === id).sort((a, b) => (b.is_current - a.is_current)); },
    async saveFiche(f) { await load(); if (!f.id) { f.id = uid(); f.created_at = new Date().toISOString(); data.fiches.push(f); } else { const i = data.fiches.findIndex(x => x.id === f.id); data.fiches[i] = { ...data.fiches[i], ...f }; f = data.fiches[i]; } f.updated_at = new Date().toISOString(); return f; },
    async deleteFiche(id) { data.fiches = data.fiches.filter(f => f.id !== id); },
    async listDocuments(id) { await load(); return data.documents.filter(d => d.station_id === id); },
    async docUrl(d) { return d.storage_path; },
    async docUrls(docs) { const o = {}; docs.forEach(d => o[d.id] = d.storage_path); return o; },
    async uploadDocument(stationId, file, kind, caption) { const d = { id: uid(), station_id: stationId, kind, storage_path: URL.createObjectURL(file), file_name: file.name, mime: file.type, size_bytes: file.size, caption, created_at: new Date().toISOString() }; data.documents.push(d); return d; },
    async deleteDocument(doc) { data.documents = data.documents.filter(d => d.id !== doc.id); },
    async log(station_id, action, details) { activity.unshift({ id: uid(), station_id, user_email: me?.email, action, details, created_at: new Date().toISOString() }); },
    async listActivity(stationId, limit = 50) { return activity.filter(a => !stationId || a.station_id === stationId).slice(0, limit); },
    async listUsers() { return USERS.map(u => ({ ...u })); },
    async listAllowed() { return USERS.map(u => ({ email: u.email, full_name: u.full_name, role: u.role })); },
    async addUser({ email, full_name, role }) { USERS.push({ id: uid(), email: email.toLowerCase(), full_name, role, active: true }); },
    async removeAllowed(email) { const i = USERS.findIndex(u => u.email === email); if (i >= 0) USERS.splice(i, 1); },
    async setUserRole(id, role) { const u = USERS.find(u => u.id === id); if (u) u.role = role; },
    async setUserActive(id, active) { const u = USERS.find(u => u.id === id); if (u) u.active = active; },
    async getSetting(k, d) { await load(); return k in data.settings ? data.settings[k] : d; },
    async setSetting(k, v) { data.settings[k] = v; }
  };
}
