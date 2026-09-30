/* FredRock Writers Room — db.js
 * Supabase client singleton. Precedence: localStorage override first, then js/config.js.
 * Graceful degradation: FR.isConfigured() === false -> pages redirect to setup.html.
 * No secrets in code. CDN: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
 */
(function () {
  "use strict";

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  function getSupabaseConfig() {
    var cfg = (typeof window.FR_CONFIG === "object" && window.FR_CONFIG) || {};
    var url = store.get("fr_supabase_url") || cfg.SUPABASE_URL || "";
    var key = store.get("fr_supabase_anon_key") || cfg.SUPABASE_ANON_KEY || "";
    return { url: String(url).trim(), key: String(key).trim() };
  }

  function isConfigured() {
    var c = getSupabaseConfig();
    return !!(c.url && c.key);
  }

  var client = null;
  function db() {
    if (!client) {
      var c = getSupabaseConfig();
      if (!c.url || !c.key) throw new Error("not-configured");
      if (typeof window.supabase === "undefined" || !window.supabase.createClient) {
        throw new Error("supabase-cdn-missing");
      }
      client = window.supabase.createClient(c.url, c.key);
    }
    return client;
  }

  function resetClient() { client = null; }

  function needsSetupPage() {
    // Called by pages when db() throws "not-configured".
    window.location.href = "setup.html?notice=not-configured";
  }

  async function getSession() {
    try {
      var r = await db().auth.getSession();
      return (r && r.data && r.data.session) || null;
    } catch (e) { return null; }
  }

  async function getWriter(session) {
    session = session || await getSession();
    if (!session) return null;
    var r = await db().from("writers").select("*").eq("id", session.user.id).maybeSingle();
    if (r.error) throw r.error;
    return r.data || null;
  }

  function isAdmin(writer) {
    return !!(writer && writer.role === "admin");
  }

  async function logActivity(writerId, action, detail) {
    if (!writerId || !action) return;
    try {
      await db().from("activity_log").insert({
        writer_id: writerId,
        action: action,
        detail: detail || {}
      });
    } catch (e) { /* activity logging must never break the app */ }
  }

  window.FR = {
    db: db,
    resetClient: resetClient,
    getSupabaseConfig: getSupabaseConfig,
    isConfigured: isConfigured,
    needsSetupPage: needsSetupPage,
    getSession: getSession,
    getWriter: getWriter,
    isAdmin: isAdmin,
    logActivity: logActivity,
    store: store
  };
})();
