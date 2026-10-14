// Data layer. Both stores expose the same async API so the app does not care which one is active.
(function () {
  const C = window.TPS_CONFIG;
  const KEY = "tpsops.demo.v2";

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // ---------- Demo store: everything lives in this browser's localStorage ----------
  function LocalStore() {
    let db = null;
    function read() {
      try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* storage unavailable */ }
      return null;
    }
    function write() {
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* keep working in memory */ }
    }
    function load() {
      if (!db) { db = read() || window.TPS_DATA.buildDemo(); write(); }
      return db;
    }
    return {
      mode: "demo",
      async session() { return { user: { email: "demo" } }; },
      async signIn() { return {}; },
      async signOut() {},
      async changePassword() {},
      async loadAll() { const d = load(); return { locations: [...d.locations], audits: [...d.audits], issues: [...d.issues] }; },
      async publicLocations() { return load().locations.filter((l) => l.active); },
      async addAudit(a) { const row = { id: newId(), created_at: new Date().toISOString(), ...a }; load().audits.push(row); write(); return row; },
      async addIssue(i) { const row = { id: newId(), created_at: new Date().toISOString(), ...i }; load().issues.push(row); write(); return row; },
      async updateIssue(id, patch) { const d = load(); const it = d.issues.find((x) => x.id === id); Object.assign(it, patch); write(); return it; },
      async updateIssues(ids, patch) { const d = load(); d.issues.forEach((x) => { if (ids.includes(x.id)) Object.assign(x, patch); }); write(); },
      async saveLocation(loc) {
        const d = load(); const i = d.locations.findIndex((x) => x.id === loc.id);
        if (i >= 0) d.locations[i] = { ...d.locations[i], ...loc }; else d.locations.push(loc);
        write(); return loc;
      },
      async resetDemo() { db = window.TPS_DATA.buildDemo(); write(); },
      async clearAll() { db = { locations: load().locations, audits: [], issues: [] }; write(); },
    };
  }

  // ---------- Supabase store: shared, multi-user ----------
  function SupabaseStore() {
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);
    const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

    // PostgREST caps each response (1000 rows by default), so page through.
    async function all(table, order) {
      const out = []; const size = 1000;
      for (let from = 0; ; from += size) {
        const rows = must(await sb.from(table).select("*").order(order, { ascending: false }).range(from, from + size - 1));
        out.push(...rows);
        if (rows.length < size) return out;
      }
    }

    return {
      mode: "live",
      async session() { return must(await sb.auth.getSession()).session; },
      async signIn(email, password) {
        if (password) return must(await sb.auth.signInWithPassword({ email, password }));
        const redirect = (C.publicUrl || location.href.split("#")[0]);
        return must(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } }));
      },
      async signOut() { await sb.auth.signOut(); },
      async changePassword(password) { must(await sb.auth.updateUser({ password })); },
      async loadAll() {
        const [locations, audits, issues] = await Promise.all([all("locations", "name"), all("audits", "audit_date"), all("issues", "created_at")]);
        return { locations, audits, issues };
      },
      async publicLocations() { return must(await sb.from("locations").select("id,name,building,categories,active").eq("active", true).order("name")); },
      async addAudit(a) { return must(await sb.from("audits").insert(a).select().single()); },
      // Anonymous visitors may insert but not read back, so the id is generated here.
      async addIssue(i) { const row = { id: newId(), ...i }; must(await sb.from("issues").insert(row)); return { created_at: new Date().toISOString(), ...row }; },
      async updateIssue(id, patch) { return must(await sb.from("issues").update(patch).eq("id", id).select().single()); },
      async updateIssues(ids, patch) { must(await sb.from("issues").update(patch).in("id", ids)); },
      async saveLocation(loc) { return must(await sb.from("locations").upsert(loc).select().single()); },
    };
  }

  window.TPS_STORE = {
    isLive: () => Boolean(C.supabaseUrl && C.supabaseAnonKey),
    create() { return this.isLive() ? SupabaseStore() : LocalStore(); },
  };
})();
