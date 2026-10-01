/* FredRock Writers Room — admin.js (part 1)
 * Admin panel: Dashboard (metrics), Writers & Invites, Question Sets, Nudges,
 * Resources, AI / Settings. All Supabase names follow ARCHITECTURE §3 exactly.
 */
(function () {
  "use strict";

  var me = null;
  var nudgeDays = 3;
  var publishedQuestionCount = 0;
  var writersCache = [];
  var setsCache = [];
  var questionsCache = [];

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function timeAgo(iso) {
    if (!iso) return "never";
    var d = new Date(iso), now = new Date();
    var mins = Math.floor((now - d) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    return Math.floor(hrs / 24) + "d ago";
  }

  function stale(iso) {
    if (!iso) return true;
    return (Date.now() - new Date(iso).getTime()) / 86400000 > nudgeDays;
  }

  function avatarHtml(url, name, size) {
    size = size || 36;
    if (url) {
      return '<img class="avatar" style="width:' + size + 'px;height:' + size + 'px" src="' + esc(url) + '" alt="' + esc(name || "") + '">';
    }
    var initials = (name || "?").trim().split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
    return '<span class="avatar avatar-initials" style="width:' + size + 'px;height:' + size + 'px" aria-hidden="true">' + esc(initials) + "</span>";
  }

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    var ctx;
    try { ctx = await Auth.requireAuth("admin"); }
    catch (e) { FR.needsSetupPage(); return; }
    if (!ctx) return;
    me = ctx.writer;
    buildTabs();
    Auth.startHeartbeat(me.id);
    try {
      await loadSettings();
      await loadDashboard();
      await loadWritersInvites();
      await loadQuestionSets();
      await loadNudges();
      await loadResources();
      initAiSettings();
    } catch (e) {
      showFatal("Could not load the admin panel: " + (e && e.message ? e.message : e));
    }
    $("signout-btn").addEventListener("click", Auth.signOut);
  }

  function showFatal(msg) {
    var el = $("fatal");
    el.textContent = msg;
    el.style.display = "block";
  }

  function buildTabs() {
    var tabs = [
      ["dashboard", "Dashboard"],
      ["writers", "Writers & Invites"],
      ["qsets", "Question Sets"],
      ["nudges", "Nudges"],
      ["resources", "Resources"],
      ["ai", "AI / Settings"]
    ];
    var nav = $("tabs");
    nav.innerHTML = "";
    tabs.forEach(function (t, i) {
      var b = document.createElement("button");
      b.className = "tab-btn" + (i === 0 ? " active" : "");
      b.textContent = t[1];
      b.dataset.tab = t[0];
      b.addEventListener("click", function () { switchTab(t[0]); });
      nav.appendChild(b);
    });
    switchTab("dashboard");
  }

  function switchTab(name) {
    document.querySelectorAll(".tab-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    document.querySelectorAll(".tab-panel").forEach(function (p) {
      p.style.display = p.id === "tab-" + name ? "block" : "none";
    });
  }

  /* ================= settings ================= */

  async function loadSettings() {
    var r = await FR.db().from("app_settings").select("key,value").eq("key", "nudge_after_days").maybeSingle();
    if (!r.error && r.data && typeof r.data.value === "number") nudgeDays = r.data.value;
    $("nudge-days-input").value = nudgeDays;
  }

  /* ================= 1. Dashboard ================= */

  async function loadDashboard() {
    var c = FR.db();
    // published question count
    var rs = await c.from("question_sets").select("id").eq("is_published", true);
    var pubSetIds = (!rs.error && rs.data) ? rs.data.map(function (s) { return s.id; }) : [];
    if (pubSetIds.length) {
      var rq = await c.from("questions").select("id").in("set_id", pubSetIds);
      publishedQuestionCount = (!rq.error && rq.data) ? rq.data.length : 0;
    }

    var rw = await c.from("writers").select("*").order("display_name");
    writersCache = (!rw.error && rw.data) ? rw.data : [];

    var ra = await c.from("answers").select("id,writer_id,question_id,word_count,body_text");
    var rrec = await c.from("recordings").select("id,writer_id,transcript_text");
    var rsc = await c.from("scripts").select("id,writer_id,word_count");

    var answers = (!ra.error && ra.data) ? ra.data : [];
    var recordings = (!rrec.error && rrec.data) ? rrec.data : [];
    var scripts = (!rsc.error && rsc.data) ? rsc.data : [];

    var totalWords = answers.reduce(function (s, a) { return s + (a.word_count || 0); }, 0) +
                     scripts.reduce(function (s, x) { return s + (x.word_count || 0); }, 0);
    var transcripts = recordings.filter(function (r) { return (r.transcript_text || "").trim().length > 0; }).length;

    // aggregate cards
    var cards = $("dash-cards");
    cards.innerHTML = "";
    [
      ["Writers", writersCache.filter(function (w) { return w.is_active !== false; }).length],
      ["Answers", answers.length],
      ["Words written", totalWords],
      ["Recordings", recordings.length],
      ["Transcripts", transcripts],
      ["Scripts", scripts.length]
    ].forEach(function (kv) {
      var d = document.createElement("div");
      d.className = "stat-card";
      d.innerHTML = "<div class='stat-num'>" + kv[1].toLocaleString() + "</div><div class='stat-label'>" + kv[0] + "</div>";
      cards.appendChild(d);
    });

    // per-writer stats
    var per = writersCache.map(function (w) {
      var wa = answers.filter(function (a) { return a.writer_id === w.id && (a.body_text || "").trim().length > 0; });
      var uniqQ = {};
      wa.forEach(function (a) { uniqQ[a.question_id] = 1; });
      var ww = wa.reduce(function (s, a) { return s + (a.word_count || 0); }, 0);
      var wrec = recordings.filter(function (r) { return r.writer_id === w.id; });
      var wtr = wrec.filter(function (r) { return (r.transcript_text || "").trim().length > 0; });
      var wsc = scripts.filter(function (s) { return s.writer_id === w.id; });
      return { writer: w, answered: wa.length, questionsAnswered: Object.keys(uniqQ).length, words: ww, recordings: wrec.length, transcripts: wtr.length, scripts: wsc.length };
    });

    // group progress bar: unique questions answered across ACTIVE writers
    var activePer = per.filter(function (p) { return p.writer.is_active !== false && p.writer.role !== "admin"; });
    var groupDone = activePer.reduce(function (s, p) { return s + p.questionsAnswered; }, 0);
    var groupTotal = activePer.length * publishedQuestionCount;
    Charts.metricBar($("dash-group-progress"),
      "All writers — " + activePer.length + " active",
      groupDone, groupTotal);

    // bar graphs (top 10 writers by each metric)
    function top(metric) {
      return per.slice().sort(function (a, b) { return b[metric] - a[metric]; }).slice(0, 10)
        .map(function (p) { return { label: p.writer.display_name, value: p[metric] }; });
    }
    Charts.barChart($("chart-answered"), top("answered"), { aria: "questions answered per writer" });
    Charts.barChart($("chart-words"), top("words"), { aria: "words written per writer" });
    Charts.barChart($("chart-recordings"), top("recordings"), { aria: "recordings per writer" });
    Charts.barChart($("chart-transcripts"), top("transcripts"), { aria: "transcripts per writer" });
    Charts.barChart($("chart-scripts"), top("scripts"), { aria: "scripts per writer" });

    // per-writer table with photo + name + individual progress bar + stale highlighting
    var tb = $("dash-writers");
    tb.innerHTML = "";
    per.forEach(function (p) {
      var w = p.writer;
      var tr = document.createElement("tr");
      if (stale(w.last_active_at)) tr.className = "stale";
      var pct = publishedQuestionCount > 0 ? Math.min(100, (p.questionsAnswered / publishedQuestionCount) * 100) : 0;
      tr.innerHTML =
        "<td><span class='writer-cell'>" + avatarHtml(w.avatar_url, w.display_name, 36) +
          "<span>" + esc(w.display_name) + (w.role === "admin" ? ' <span class="badge">admin</span>' : "") +
          (w.is_active === false ? ' <span class="badge off">inactive</span>' : "") + "</span></span></td>" +
        "<td><div class='mini-progress' title='" + p.questionsAnswered + " of " + publishedQuestionCount + " questions'>" +
          "<div class='mini-progress-fill' style='width:" + pct.toFixed(0) + "%'></div></div>" +
          "<span class='muted'>" + p.questionsAnswered + "/" + publishedQuestionCount + "</span></td>" +
        "<td>" + p.answered + "</td><td>" + p.words.toLocaleString() + "</td>" +
        "<td>" + p.recordings + "</td><td>" + p.transcripts + "</td><td>" + p.scripts + "</td>" +
        "<td>" + timeAgo(w.last_active_at) + "</td>";
      tb.appendChild(tr);
    });

    var mb = $("dash-completion");
    mb.innerHTML = "<h4>Completion — % of published questions answered (" + publishedQuestionCount + " published)</h4>";
    per.forEach(function (p) {
      var d = document.createElement("div");
      mb.appendChild(d);
      // completion = UNIQUE questions answered (not total answer rows — multiple
      // answers per question are allowed) of published questions
      Charts.metricBar(d, p.writer.display_name, p.questionsAnswered, publishedQuestionCount);
    });
  }

  /* ================= 2. Writers & Invites ================= */

  function randomCode(n) {
    var chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    var s = "";
    for (var i = 0; i < (n || 8); i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  async function loadWritersInvites() {
    renderWritersTable();
    renderUnclaimedCodes();
    $("gen-codes-btn").addEventListener("click", generateCodes);
  }

  function renderWritersTable() {
    var tb = $("writers-table");
    tb.innerHTML = "";
    writersCache.forEach(function (w) {
      var tr = document.createElement("tr");
      if (stale(w.last_active_at)) tr.className = "stale";
      tr.innerHTML =
        "<td>" + esc(w.display_name) + "</td>" +
        "<td>" + esc(w.email || "—") + "</td>" +
        "<td>" + esc(w.role || "writer") + "</td>" +
        "<td>" + timeAgo(w.last_active_at) + "</td>" +
        "<td>" + (w.is_active === false ? "inactive" : "active") + "</td>";
      var tdAct = document.createElement("td");

      var roleSel = document.createElement("select");
      ["writer", "admin"].forEach(function (r) {
        var o = document.createElement("option");
        o.value = r; o.textContent = r;
        if (w.role === r) o.selected = true;
        roleSel.appendChild(o);
      });
      roleSel.disabled = (w.id === me.id);
      roleSel.title = w.id === me.id ? "You cannot change your own role" : "Change role";
      roleSel.addEventListener("change", function () { updateWriter(w.id, { role: roleSel.value }); });
      tdAct.appendChild(roleSel);

      var tog = document.createElement("button");
      tog.className = "btn small" + (w.is_active === false ? "" : " danger");
      tog.textContent = w.is_active === false ? "Reactivate" : "Deactivate";
      tog.disabled = (w.id === me.id);
      tog.addEventListener("click", function () {
        updateWriter(w.id, { is_active: w.is_active === false });
      });
      tdAct.appendChild(tog);
      tr.appendChild(tdAct);
      tb.appendChild(tr);
    });
  }

  async function updateWriter(id, patch) {
    try {
      var r = await FR.db().from("writers").update(patch).eq("id", id).select().single();
      if (r.error) throw r.error;
      var i = writersCache.findIndex(function (w) { return w.id === id; });
      if (i >= 0) writersCache[i] = r.data;
      renderWritersTable();
      await loadDashboard(); // refresh aggregates/stale flags
    } catch (e) {
      alert("Update failed: " + (e.message || e));
    }
  }

  async function generateCodes() {
    var n = Math.max(1, Math.min(50, parseInt($("gen-codes-n").value, 10) || 10));
    var rows = [];
    for (var i = 0; i < n; i++) rows.push({ code: randomCode(8), role: "writer", created_by: me.id });
    $("gen-codes-status").textContent = "creating…";
    try {
      var r = await FR.db().from("invite_codes").insert(rows).select("code");
      if (r.error) throw r.error;
      var codes = r.data.map(function (x) { return x.code; });
      $("gen-codes-status").textContent = n + " codes created ✓";
      $("gen-codes-out").value = codes.join("\n");
      renderUnclaimedCodes();
    } catch (e) {
      $("gen-codes-status").textContent = "failed";
      alert("Could not create codes: " + (e.message || e));
    }
  }

  async function renderUnclaimedCodes() {
    var r = await FR.db().from("invite_codes").select("code,created_at,note").is("claimed_by", null).order("created_at", { ascending: false }).limit(50);
    var wrap = $("unclaimed-codes");
    wrap.innerHTML = "";
    if (r.error || !(r.data || []).length) {
      wrap.innerHTML = '<div class="empty">No unclaimed codes. Generate some above.</div>';
      return;
    }
    var ta = document.createElement("textarea");
    ta.rows = Math.min(10, r.data.length + 1);
    ta.readOnly = true;
    ta.value = r.data.map(function (x) { return x.code; }).join("\n");
    var copy = document.createElement("button");
    copy.className = "btn small";
    copy.textContent = "Copy all";
    copy.addEventListener("click", function () { ta.select(); document.execCommand("copy"); });
    wrap.appendChild(ta);
    wrap.appendChild(copy);
  }
/* FredRock Writers Room — admin.js (part 2): Question Sets, Nudges, Resources, AI/Settings.
 * Same IIFE continuation as part 1 (joined at write time). Do not redeclare helpers.
 */

/* ================= 3. Question Sets ================= */

async function loadQuestionSets() {
  var c = FR.db();
  var rs = await c.from("question_sets").select("*").order("sort_order");
  setsCache = (!rs.error && rs.data) ? rs.data : [];
  var setIds = setsCache.map(function (s) { return s.id; });
  questionsCache = [];
  if (setIds.length) {
    var rq = await c.from("questions").select("*").in("set_id", setIds).order("sort_order");
    questionsCache = (!rq.error && rq.data) ? rq.data : [];
  }
  renderSets();
  $("add-round-btn").addEventListener("click", addRound);
}

function renderSets() {
  var wrap = $("sets-list");
  wrap.innerHTML = "";
  if (!setsCache.length) wrap.innerHTML = '<div class="empty">No question rounds yet. Add one to start.</div>';
  setsCache.forEach(function (set) {
    var d = document.createElement("div");
    d.className = "set-card" + (set.is_published ? "" : " draft");
    d.innerHTML =
      "<div class='set-head'><strong>" + esc(set.title) + "</strong> " +
      (set.is_published ? '<span class="badge">published</span>' : '<span class="badge off">draft</span>') +
      ' <span class="muted">order ' + (set.sort_order || 0) + "</span></div>" +
      (set.description ? '<p class="muted">' + esc(set.description) + "</p>" : "");

    var qlist = document.createElement("div");
    qlist.className = "set-questions";
    var qs = questionsCache.filter(function (q) { return q.set_id === set.id; });
    qs.forEach(function (q) {
      var qd = document.createElement("div");
      qd.className = "qrow";
      qd.innerHTML = "<span><strong>#" + (q.sort_order || 0) + "</strong> " + esc(q.prompt_text.slice(0, 90)) + "</span>";
      var edit = document.createElement("button");
      edit.className = "btn small ghost"; edit.textContent = "Edit";
      edit.addEventListener("click", function () { editQuestion(q); });
      var del = document.createElement("button");
      del.className = "btn small danger ghost"; del.textContent = "Delete";
      del.addEventListener("click", function () { deleteQuestion(q); });
      qd.appendChild(edit); qd.appendChild(del);
      qlist.appendChild(qd);
    });
    d.appendChild(qlist);

    var row = document.createElement("div");
    row.className = "btn-row";
    var addQ = btn("small", "+ Question", function () { editQuestion({ set_id: set.id, prompt_text: "", help_text: "", sort_order: qs.length + 1 }); });
    var editS = btn("small ghost", "Edit round", function () { editSet(set); });
    var pub = btn("small" + (set.is_published ? " danger" : ""), set.is_published ? "Unpublish" : "Publish",
      function () { togglePublish(set); });
    var delS = btn("small danger ghost", "Delete round", function () { deleteSet(set); });
    [addQ, editS, pub, delS].forEach(function (b) { row.appendChild(b); });
    d.appendChild(row);
    wrap.appendChild(d);
  });
}

function btn(cls, label, fn) {
  var b = document.createElement("button");
  b.className = "btn " + cls;
  b.textContent = label;
  b.addEventListener("click", fn);
  return b;
}

function editSet(set) {
  var title = prompt("Round title:", set.title || "");
  if (title === null) return;
  var desc = prompt("Description (optional):", set.description || "");
  if (desc === null) return;
  var order = prompt("Sort order:", String(set.sort_order || 0));
  if (order === null) return;
  FR.db().from("question_sets").update({ title: title.trim(), description: desc.trim() || null, sort_order: parseInt(order, 10) || 0 })
    .eq("id", set.id).select().single()
    .then(function (r) {
      if (r.error) throw r.error;
      var i = setsCache.findIndex(function (s) { return s.id === set.id; });
      setsCache[i] = r.data;
      renderSets();
    })
    .catch(function (e) { alert("Save failed: " + (e.message || e)); });
}

function addRound() {
  var title = prompt("New round title (e.g. Round 2: Craft):", "");
  if (!title || !title.trim()) return;
  FR.db().from("question_sets").insert({
    title: title.trim(), description: null,
    sort_order: setsCache.length + 1, is_published: false, created_by: me.id
  }).select().single()
    .then(function (r) {
      if (r.error) throw r.error;
      setsCache.push(r.data);
      renderSets();
    })
    .catch(function (e) { alert("Create failed: " + (e.message || e)); });
}

function togglePublish(set) {
  FR.db().from("question_sets").update({ is_published: !set.is_published }).eq("id", set.id).select().single()
    .then(function (r) {
      if (r.error) throw r.error;
      var i = setsCache.findIndex(function (s) { return s.id === set.id; });
      setsCache[i] = r.data;
      renderSets();
      loadDashboard(); // published count drives completion metrics
    })
    .catch(function (e) { alert("Update failed: " + (e.message || e)); });
}

function deleteSet(set) {
  if (!confirm("Delete round \"" + set.title + "\" and ALL its questions? This cannot be undone.")) return;
  FR.db().from("question_sets").delete().eq("id", set.id)
    .then(function (r) {
      if (r.error) throw r.error;
      setsCache = setsCache.filter(function (s) { return s.id !== set.id; });
      questionsCache = questionsCache.filter(function (q) { return q.set_id !== set.id; });
      renderSets();
    })
    .catch(function (e) { alert("Delete failed: " + (e.message || e)); });
}

function editQuestion(q) {
  var isNew = !q.id;
  var promptText = prompt("Question prompt:", q.prompt_text || "");
  if (promptText === null || !promptText.trim()) return;
  var help = prompt("Help text (optional):", q.help_text || "");
  if (help === null) return;
  var order = prompt("Sort order:", String(q.sort_order || 0));
  if (order === null) return;
  var payload = {
    set_id: q.set_id,
    prompt_text: promptText.trim(),
    help_text: help.trim() || null,
    sort_order: parseInt(order, 10) || 0
  };
  var req = isNew
    ? FR.db().from("questions").insert(payload).select().single()
    : FR.db().from("questions").update(payload).eq("id", q.id).select().single();
  req.then(function (r) {
      if (r.error) throw r.error;
      if (isNew) questionsCache.push(r.data);
      else {
        var i = questionsCache.findIndex(function (x) { return x.id === q.id; });
        questionsCache[i] = r.data;
      }
      renderSets();
    })
    .catch(function (e) { alert("Save failed: " + (e.message || e)); });
}

function deleteQuestion(q) {
  if (!confirm("Delete this question? Answers already written to it are kept (answers reference the question).")) return;
  FR.db().from("questions").delete().eq("id", q.id)
    .then(function (r) {
      if (r.error) throw r.error;
      questionsCache = questionsCache.filter(function (x) { return x.id !== q.id; });
      renderSets();
    })
    .catch(function (e) { alert("Delete failed: " + (e.message || e)); });
}

/* ================= 4. Nudges ================= */

async function loadNudges() {
  $("save-nudge-days").addEventListener("click", saveNudgeDays);
  renderStaleList();
}

async function saveNudgeDays() {
  var v = Math.max(1, parseInt($("nudge-days-input").value, 10) || 3);
  try {
    var r = await FR.db().from("app_settings")
      .upsert({ key: "nudge_after_days", value: v }, { onConflict: "key" }).select().single();
    if (r.error) throw r.error;
    nudgeDays = v;
    $("nudge-days-status").textContent = "saved ✓";
    renderStaleList();
    renderWritersTable();
    await loadDashboard();
  } catch (e) {
    $("nudge-days-status").textContent = "save failed";
    alert("Save failed: " + (e.message || e));
  }
}

function renderStaleList() {
  var wrap = $("stale-list");
  wrap.innerHTML = "";
  var staleWriters = writersCache.filter(function (w) {
    return w.is_active !== false && w.role !== "admin" && stale(w.last_active_at);
  });
  if (!staleWriters.length) {
    wrap.innerHTML = '<div class="empty">Nobody is past the ' + nudgeDays + '-day threshold. 🎉</div>';
    return;
  }
  staleWriters.forEach(function (w) {
    var d = document.createElement("div");
    d.className = "stale-card";
    d.innerHTML = "<strong>" + esc(w.display_name) + "</strong> <span class='muted'>last active " + timeAgo(w.last_active_at) + "</span>";
    var s = btn("small", "Send nudge", function () { sendNudge(w); });
    d.appendChild(s);
    wrap.appendChild(d);
  });
}

function nudgeMessage(name) {
  return "Hey " + name + " — the FredRock Writers Room misses your voice. " +
    "It's been a few days since your last session; even ten minutes on one question " +
    "keeps the story moving. Jump back in when you can. — The Room";
}

async function sendNudge(w) {
  var title = "The room misses your voice";
  var body = nudgeMessage(w.display_name);
  try {
    var rn = await FR.db().from("notifications").insert({
      writer_id: w.id, kind: "nudge", title: title, body: body
    }).select().single();
    if (rn.error) throw rn.error;
    await FR.logActivity(me.id, "nudge_sent", { to_writer_id: w.id });
    // copyable message for email/text (email sending is NOT wired — honest note)
    var out = $("nudge-copy");
    out.style.display = "block";
    out.value = body;
    alert("Nudge sent to " + w.display_name + " (in-app notification). The message is in the box below — copy it for email or text.");
  } catch (e) {
    alert("Nudge failed: " + (e.message || e));
  }
}

/* ================= 5. Resources ================= */

var resourcesCache = [];

async function loadResources() {
  var r = await FR.db().from("resources").select("*").order("sort_order");
  resourcesCache = (!r.error && r.data) ? r.data : [];
  renderResources();
  $("add-resource-btn").addEventListener("click", function () {
    editResource({ title: "", kind: "guide", body_md: "", url: null, sort_order: resourcesCache.length });
  });
}

function renderResources() {
  var wrap = $("resources-admin");
  wrap.innerHTML = "";
  if (!resourcesCache.length) wrap.innerHTML = '<div class="empty">No resources yet.</div>';
  resourcesCache.forEach(function (res) {
    var d = document.createElement("div");
    d.className = "resource-row";
    d.innerHTML = "<strong>" + esc(res.title) + "</strong> <span class='muted'>" + esc(res.kind || "guide") + "</span>";
    d.appendChild(btn("small ghost", "Edit", function () { editResource(res); }));
    d.appendChild(btn("small danger ghost", "Delete", function () {
      if (!confirm("Delete resource \"" + res.title + "\"?")) return;
      FR.db().from("resources").delete().eq("id", res.id).then(function (rr) {
        if (rr.error) { alert("Delete failed: " + rr.error.message); return; }
        resourcesCache = resourcesCache.filter(function (x) { return x.id !== res.id; });
        renderResources();
      });
    }));
    wrap.appendChild(d);
  });
}

function editResource(res) {
  var isNew = !res.id;
  var title = prompt("Resource title:", res.title || "");
  if (title === null || !title.trim()) return;
  var kind = prompt("Kind (guide / video / link):", res.kind || "guide");
  if (kind === null) return;
  var url = prompt("URL (optional):", res.url || "");
  if (url === null) return;
  var order = prompt("Sort order:", String(res.sort_order || 0));
  if (order === null) return;
  var body = prompt("Body (markdown, optional — long text OK):", (res.body_md || "").slice(0, 2000));
  if (body === null) return;
  var payload = {
    title: title.trim(), kind: kind.trim() || "guide",
    url: url.trim() || null, sort_order: parseInt(order, 10) || 0,
    body_md: body || null
  };
  var req = isNew
    ? FR.db().from("resources").insert(payload).select().single()
    : FR.db().from("resources").update(payload).eq("id", res.id).select().single();
  req.then(function (r) {
      if (r.error) throw r.error;
      if (isNew) resourcesCache.push(r.data);
      else {
        var i = resourcesCache.findIndex(function (x) { return x.id === res.id; });
        resourcesCache[i] = r.data;
      }
      renderResources();
    })
    .catch(function (e) { alert("Save failed: " + (e.message || e)); });
}

/* ================= 6. AI / Settings ================= */

function initAiSettings() {
  var get = function (k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  $("ai-endpoint").value = get("fr_ai_endpoint");
  $("ai-model").value = get("fr_ai_model");
  $("ai-key").value = get("fr_ai_key");
  var note = $("ai-local-note");
  note.textContent = "Stored in THIS browser's localStorage only. Never sent to the database. " +
    "Each device that should use Connect AI needs these entered here.";
  $("ai-save").addEventListener("click", function () {
    try {
      localStorage.setItem("fr_ai_endpoint", $("ai-endpoint").value.trim());
      localStorage.setItem("fr_ai_model", $("ai-model").value.trim());
      localStorage.setItem("fr_ai_key", $("ai-key").value.trim());
      $("ai-status").textContent = "saved ✓";
    } catch (e) { $("ai-status").textContent = "save failed"; }
  });
  $("ai-clear").addEventListener("click", function () {
    ["fr_ai_endpoint", "fr_ai_model", "fr_ai_key"].forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    $("ai-endpoint").value = ""; $("ai-model").value = ""; $("ai-key").value = "";
    $("ai-status").textContent = "cleared";
  });
  $("ai-test").addEventListener("click", async function () {
    $("ai-status").textContent = "testing…";
    var res = await Coach.callAiEndpoint([
      { role: "user", content: "Reply with exactly: AI connection OK" }
    ]);
    $("ai-status").textContent = res.error ? ("failed: " + res.error) : ("OK — " + res.output.slice(0, 120));
    $("ai-status").className = "support-note " + (res.error ? "warn" : "ok");
  });
  // app settings viewer
  FR.db().from("app_settings").select("key,value").order("key").then(function (r) {
    var wrap = $("app-settings-list");
    wrap.innerHTML = "";
    if (r.error || !(r.data || []).length) {
      wrap.innerHTML = '<div class="empty">No app settings rows.</div>';
      return;
    }
    r.data.forEach(function (row) {
      var d = document.createElement("div");
      d.className = "setting-row";
      d.innerHTML = "<code>" + esc(row.key) + "</code> = <code>" + esc(JSON.stringify(row.value)) + "</code>";
      wrap.appendChild(d);
    });
  });
}

})();
