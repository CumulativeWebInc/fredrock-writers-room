/* FredRock Writers Room — auth.js
 * Signup / sign-in / sign-out, claim_invite RPC, writers-row ensure,
 * role-based routing, last_active_at heartbeat.
 *
 * Contract (ARCHITECTURE §3):
 *   RPC claim_invite(p_code text) SECURITY DEFINER -> verifies code exists & unclaimed,
 *   sets claimed_by=auth.uid(), claimed_at=now(), returns role.
 *   writers(id = auth.users.id, display_name, email, role, invite_code, is_active,
 *           share_by_default, last_active_at, created_at)
 */
(function () {
  "use strict";

  async function claimInvite(code) {
    var r = await FR.db().rpc("claim_invite", { p_code: code });
    if (r.error) throw r.error;
    return r.data; // the role string returned by the RPC
  }

  async function ensureWritersRow(session, displayName, email, inviteCode, roleFromRpc) {
    var client = FR.db();
    var existing = await client.from("writers").select("*").eq("id", session.user.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data;
    var row = {
      id: session.user.id,
      display_name: displayName || (session.user.email || "Writer").split("@")[0],
      email: email || session.user.email || null,
      role: roleFromRpc || "writer",
      invite_code: inviteCode || null,
      is_active: true,
      share_by_default: false,
      last_active_at: new Date().toISOString()
    };
    var ins = await client.from("writers").insert(row).select().single();
    if (ins.error) throw ins.error;
    return ins.data;
  }

  async function signUp(displayName, email, password, inviteCode) {
    var client = FR.db();
    // Pass email as the auth identity; invite code verified via RPC after signup.
    var r = await client.auth.signUp({
      email: email,
      password: password,
      options: { data: { display_name: displayName } }
    });
    if (r.error) throw r.error;
    var session = r.data.session;
    if (!session) {
      // Email confirmation enabled: user must confirm before a session exists.
      return { needsConfirmation: true };
    }
    var role = null;
    if (inviteCode) role = await claimInvite(inviteCode.trim().toUpperCase());
    var writer = await ensureWritersRow(session, displayName, email, inviteCode, role);
    await FR.logActivity(writer.id, "signup", { via: "invite_code" });
    await heartbeat(writer.id);
    return { session: session, writer: writer };
  }

  async function signIn(email, password) {
    var client = FR.db();
    var r = await client.auth.signInWithPassword({ email: email, password: password });
    if (r.error) throw r.error;
    var session = r.data.session;
    var writer = await getOrCreateWritersRow(session);
    if (!writer) throw new Error("no-writer-row");
    if (writer.is_active === false) {
      await client.auth.signOut();
      throw new Error("account-deactivated");
    }
    await FR.logActivity(writer.id, "login", {});
    await heartbeat(writer.id);
    return { session: session, writer: writer };
  }

  async function getOrCreateWritersRow(session) {
    // Returning user who claimed an invite in a prior session already has a row.
    var client = FR.db();
    var existing = await client.from("writers").select("*").eq("id", session.user.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data;
    return ensureWritersRow(session, null, session.user.email, null, "writer");
  }

  async function signOut() {
    try { await FR.db().auth.signOut(); } catch (e) {}
    window.location.href = "index.html";
  }

  async function heartbeat(writerId) {
    if (!writerId) return;
    try {
      await FR.db().from("writers").update({ last_active_at: new Date().toISOString() }).eq("id", writerId);
    } catch (e) {}
  }

  function routeByRole(writer) {
    if (FR.isAdmin(writer)) window.location.href = "admin.html";
    else window.location.href = "writer.html";
  }

  // Guard for protected pages: requires configured Supabase + active session + writers row.
  // requireRole: null (any authenticated), "writer", or "admin".
  async function requireAuth(requireRole) {
    if (!FR.isConfigured()) { FR.needsSetupPage(); return null; }
    var session;
    try { session = await FR.getSession(); }
    catch (e) { FR.needsSetupPage(); return null; }
    if (!session) { window.location.href = "index.html"; return null; }
    var writer;
    try { writer = await getOrCreateWritersRow(session); }
    catch (e) { window.location.href = "index.html"; return null; }
    if (!writer || writer.is_active === false) {
      try { await FR.db().auth.signOut(); } catch (e2) {}
      window.location.href = "index.html?notice=deactivated";
      return null;
    }
    if (requireRole === "admin" && !FR.isAdmin(writer)) {
      window.location.href = "writer.html";
      return null;
    }
    await heartbeat(writer.id);
    return { session: session, writer: writer };
  }

  function startHeartbeat(writerId, intervalMs) {
    setInterval(function () { heartbeat(writerId); }, intervalMs || 5 * 60 * 1000);
  }

  window.Auth = {
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    claimInvite: claimInvite,
    ensureWritersRow: ensureWritersRow,
    getOrCreateWritersRow: getOrCreateWritersRow,
    heartbeat: heartbeat,
    routeByRole: routeByRole,
    requireAuth: requireAuth,
    startHeartbeat: startHeartbeat
  };
})();
