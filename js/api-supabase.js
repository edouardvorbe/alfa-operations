// Adaptateur de données — Supabase (production)
export function createSupabaseApi(cfg) {
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const BUCKET = "stations";
  let me = null;

  async function loadProfile(user) {
    if (!user) { me = null; return null; }
    const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) throw error;
    if (!data || !data.active) { me = { id: user.id, email: user.email, role: null, active: false }; return me; }
    me = { id: user.id, email: user.email, role: data.role, full_name: data.full_name, active: true };
    return me;
  }
  function err(e) { throw new Error(e?.message || String(e)); }

  const api = {
    mode: "supabase",
    // ---- auth
    async init() {
      const { data: { session } } = await sb.auth.getSession();
      return loadProfile(session?.user || null);
    },
    onAuthChange(cb) {
      sb.auth.onAuthStateChange(async (_evt, session) => { cb(await loadProfile(session?.user || null)); });
    },
    me() { return me; },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) err(error);
      return loadProfile(data.user);
    },
    async signOut() { await sb.auth.signOut(); me = null; },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) err(error);
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) err(error);
    },
    async updateMyName(full_name) {
      const { error } = await sb.from("profiles").update({ full_name }).eq("id", me.id);
      if (error) err(error);
      me.full_name = full_name;
    },

    // ---- stations
    async listStations() {
      const { data, error } = await sb.from("station_overview").select("*").order("sort_order").order("name");
      if (error) err(error);
      return data;
    },
    async getStation(id) {
      const { data, error } = await sb.from("station_overview").select("*").eq("id", id).maybeSingle();
      if (error) err(error);
      return data;
    },
    async saveStation(st) {
      const row = { ...st };
      delete row.has_fiche; delete row.n_docs; delete row.fiche_updated_at;
      const { data, error } = await sb.from("stations").upsert(row).select().single();
      if (error) err(error);
      return data;
    },
    async deleteStation(id) {
      const { error } = await sb.from("stations").delete().eq("id", id);
      if (error) err(error);
    },

    // ---- fiches
    async listFiches(stationId) {
      const { data, error } = await sb.from("fiches").select("*").eq("station_id", stationId).order("is_current", { ascending: false }).order("updated_at", { ascending: false });
      if (error) err(error);
      return data;
    },
    async saveFiche(f) {
      const { data, error } = await sb.from("fiches").upsert(f).select().single();
      if (error) err(error);
      return data;
    },
    async deleteFiche(id) {
      const { error } = await sb.from("fiches").delete().eq("id", id);
      if (error) err(error);
    },

    // ---- documents
    async listDocuments(stationId) {
      const { data, error } = await sb.from("documents").select("*").eq("station_id", stationId).order("kind").order("sort_order").order("created_at");
      if (error) err(error);
      return data;
    },
    async docUrl(doc, expires = 3600) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(doc.storage_path, expires);
      if (error) err(error);
      return data.signedUrl;
    },
    async docUrls(docs) {
      if (!docs.length) return {};
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(docs.map(d => d.storage_path), 3600);
      if (error) err(error);
      const out = {};
      data.forEach((d, i) => { out[docs[i].id] = d.signedUrl; });
      return out;
    },
    async uploadDocument(stationId, file, kind, caption) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${stationId}/${Date.now()}_${safe}`;
      const { error: e1 } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (e1) err(e1);
      const row = { station_id: stationId, kind, storage_path: path, file_name: file.name, mime: file.type, size_bytes: file.size, caption, uploaded_by: me?.id };
      const { data, error } = await sb.from("documents").insert(row).select().single();
      if (error) err(error);
      return data;
    },
    async deleteDocument(doc) {
      await sb.storage.from(BUCKET).remove([doc.storage_path]);
      const { error } = await sb.from("documents").delete().eq("id", doc.id);
      if (error) err(error);
    },

    // ---- activité
    async log(stationId, action, details) {
      await sb.from("activity").insert({ station_id: stationId, user_id: me?.id, user_email: me?.email, action, details });
    },
    async listActivity(stationId, limit = 50) {
      let q = sb.from("activity").select("*").order("created_at", { ascending: false }).limit(limit);
      if (stationId) q = q.eq("station_id", stationId);
      const { data, error } = await q;
      if (error) err(error);
      return data;
    },

    // ---- admin
    async listUsers() {
      const { data, error } = await sb.from("profiles").select("*").order("email");
      if (error) err(error);
      return data;
    },
    async listAllowed() {
      const { data, error } = await sb.from("allowed_users").select("*").order("email");
      if (error) err(error);
      return data;
    },
    async addUser({ email, full_name, role, password }) {
      email = email.trim().toLowerCase();
      const { error: e1 } = await sb.from("allowed_users").upsert({ email, full_name, role, invited_by: me?.id });
      if (e1) err(e1);
      if (password) {
        // Client secondaire (session non persistée) pour créer le compte sans déconnecter l'admin
        const tmp = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { error: e2 } = await tmp.auth.signUp({ email, password, options: { data: { full_name } } });
        if (e2) err(e2);
      }
    },
    async removeAllowed(email) {
      const { error } = await sb.from("allowed_users").delete().eq("email", email);
      if (error) err(error);
    },
    async setUserRole(id, role) {
      const { error } = await sb.from("profiles").update({ role }).eq("id", id);
      if (error) err(error);
      const { data } = await sb.from("profiles").select("email").eq("id", id).single();
      if (data) await sb.from("allowed_users").update({ role }).eq("email", data.email);
    },
    async setUserActive(id, active) {
      const { error } = await sb.from("profiles").update({ active }).eq("id", id);
      if (error) err(error);
    },

    // ---- réglages
    async getSetting(key, dflt) {
      const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
      return data ? data.value : dflt;
    },
    async setSetting(key, value) {
      const { error } = await sb.from("settings").upsert({ key, value });
      if (error) err(error);
    }
  };
  return api;
}
