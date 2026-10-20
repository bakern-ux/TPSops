// Data layer. Both stores expose the same async API so the app does not care which one is active.
(function () {
  const C = window.TPS_CONFIG;
  const KEY = "tpsops.demo.v3";

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
      // Demo mode has no accounts; "View as" in the demo banner picks which kind of person to preview.
      async profile() {
        let role = "ops";
        try { role = localStorage.getItem("tpsops.demoRole") || "ops"; } catch (e) { /* ignore */ }
        const p = { ops: ["Facilities Director (demo)", "customer", "ops"], customer: ["Asst. Head of School (demo)", "customer", "auditor"], vendor: ["Housekeeping Supervisor (demo)", "vendor", "auditor"] }[role] || [];
        return { user_id: "demo-" + role, email: "demo", full_name: p[0] || "", side: p[1] || "customer", access: p[2] || "ops" };
      },
      async setMyName() {},
      async listProfiles() { return []; },
      async updateProfile() {},
      async loadAll(profile) {
        const d = load();
        if (profile && profile.access !== "ops") return { locations: [...d.locations], audits: [], issues: [] };
        return { locations: [...d.locations], audits: [...d.audits], issues: [...d.issues] };
      },
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
      async profile() {
        const session = must(await sb.auth.getSession()).session;
        if (!session) return null;
        const res = await sb.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle();
        // Before 002_roles.sql has been run there is no profiles table, and the database still gives every
        // signed-in person full access, so keep working as before instead of failing.
        if (res.error && /profiles|PGRST205|42P01|does not exist|schema cache/i.test(res.error.message + " " + (res.error.code || ""))) {
          return { user_id: session.user.id, email: session.user.email, full_name: "", side: "customer", access: "ops", rolesMissing: true };
        }
        const row = must(res);
        // No profile yet (roles not set up): treat as a customer auditor, the least access.
        return row || { user_id: session.user.id, email: session.user.email, full_name: "", side: "customer", access: "auditor" };
      },
      async setMyName(name) { must(await sb.rpc("set_my_name", { new_name: name })); },
      async listProfiles() { return must(await sb.from("profiles").select("*").order("email")); },
      async updateProfile(id, patch) { must(await sb.from("profiles").update(patch).eq("user_id", id)); },
      // Auditors only need locations; the database would hide everything else from them anyway.
      async loadAll(profile) {
        if (profile && profile.access !== "ops") return { locations: await all("locations", "name"), audits: [], issues: [] };
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
