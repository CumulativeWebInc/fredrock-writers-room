/* FredRock Writers Room — writer.js (part 1)
 * The writer room: Questions, Voice Studio, Script Studio, Writing Coach, Room, Resources.
 * All Supabase names follow ARCHITECTURE §3 exactly.
 */
(function () {
  "use strict";

  var me = null;            // writers row
  var sets = [];            // published question_sets
  var questions = [];       // questions of published sets
  var answers = {};         // question_id -> [answer rows]
  var myScripts = [];
  var myRecordings = [];
  var nudgeDays = 3;
  var autosaveTimers = {};
  var nudgeLogThrottle = {};

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function words(t) {
    return (t || "").trim().split(/\s+/).filter(Boolean).length;
  }

  function timeAgo(iso) {
    if (!iso) return "never";
    var d = new Date(iso), now = new Date();
    var mins = Math.floor((now - d) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    var days = Math.floor(hrs / 24);
    return days + "d ago";
  }

  /* ================= boot ================= */

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    var ctx;
    try {
      ctx = await Auth.requireAuth(null);   // redirects on its own if needed
    } catch (e) {
      FR.needsSetupPage();
      return;
    }
    if (!ctx) return;
    me = ctx.writer;
    var whoLine = $("who-line");
    if (whoLine) whoLine.textContent = "Welcome, " + (me.display_name || "writer");
    buildTabs();
    Auth.startHeartbeat(me.id);
    try {
      await loadSettings();
      await loadQuestions();
      await loadScripts();
      await loadRecordings();
      await loadRoom();
      await loadResources();
      await loadNotifications();
      renderProgress();
      checkNudgeBanner();
      initVoiceStudio();
      initCoach();
      initScriptStudio();
      renderHelp();
      initAvatar();
      maybeOnboard();
    } catch (e) {
      showFatal("Could not load the room: " + (e && e.message ? e.message : e));
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
      ["questions", "Questions"],
      ["voice", "Voice Studio"],
      ["script", "Script Studio"],
      ["coach", "Writing Coach"],
      ["room", "Room"],
      ["resources", "Resources"],
      ["help", "Help"]
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
    switchTab("questions");
  }

  function switchTab(name) {
    document.querySelectorAll(".tab-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    document.querySelectorAll(".tab-panel").forEach(function (p) {
      p.style.display = p.id === "tab-" + name ? "block" : "none";
    });
  }

  /* ================= shared loads ================= */

  async function loadSettings() {
    var r = await FR.db().from("app_settings").select("key,value").eq("key", "nudge_after_days").maybeSingle();
    if (!r.error && r.data && typeof r.data.value === "number") nudgeDays = r.data.value;
  }

  async function loadQuestions() {
    var c = FR.db();
    var rs = await c.from("question_sets").select("*").eq("is_published", true).order("sort_order");
    if (rs.error) throw rs.error;
    sets = rs.data || [];
    var setIds = sets.map(function (s) { return s.id; });
    if (setIds.length) {
      var rq = await c.from("questions").select("*").in("set_id", setIds).order("sort_order");
      if (rq.error) throw rq.error;
      questions = rq.data || [];
    }
    var ra = await c.from("answers").select("*").eq("writer_id", me.id);
    if (ra.error) throw ra.error;
    answers = {};
    (ra.data || []).forEach(function (a) {
      (answers[a.question_id] = answers[a.question_id] || []).push(a);
    });
    renderQuestions();
  }

  async function loadScripts() {
    var r = await FR.db().from("scripts").select("*").eq("writer_id", me.id).order("updated_at", { ascending: false });
    if (r.error) throw r.error;
    myScripts = r.data || [];
  }

  async function loadRecordings() {
    var r = await FR.db().from("recordings").select("*").eq("writer_id", me.id).order("created_at", { ascending: false });
    if (r.error) throw r.error;
    myRecordings = r.data || [];
    renderMyRecordings();
  }

  /* ================= 1. Questions ================= */

  function renderQuestions() {
    var wrap = $("questions-list");
    wrap.innerHTML = "";
    if (!sets.length) {
      wrap.innerHTML = '<div class="empty">No question rounds are published yet. Check back soon.</div>';
      return;
    }
    sets.forEach(function (set) {
      var setDiv = document.createElement("div");
      setDiv.className = "qset";
      setDiv.innerHTML = '<h3>' + esc(set.title) + "</h3>" +
        (set.description ? '<p class="muted">' + esc(set.description) + "</p>" : "");
      var qs = questions.filter(function (q) { return q.set_id === set.id; });
      if (!qs.length) setDiv.innerHTML += '<div class="empty">Questions coming soon.</div>';
      qs.forEach(function (q) { setDiv.appendChild(questionCard(q)); });
      wrap.appendChild(setDiv);
    });
  }

  function questionCard(q) {
    var list = answers[q.id] || [];
    var card = document.createElement("div");
    card.className = "qcard";
    card.dataset.qid = q.id;

    var head = document.createElement("div");
    head.className = "qcard-head";
    head.innerHTML = "<h4>" + esc(q.prompt_text) + "</h4>" +
      (q.help_text ? '<p class="muted">' + esc(q.help_text) + "</p>" : "");
    var headBtns = document.createElement("div");
    headBtns.className = "qcard-head-btns";
    var qTts = document.createElement("button");
    qTts.className = "btn small ghost tts-btn";
    qTts.textContent = "🔊";
    qTts.title = "Read this question out loud";
    qTts.setAttribute("aria-label", "Read question out loud");
    qTts.addEventListener("click", function () {
      TTS.toggle(q.prompt_text + ". " + (q.help_text || ""), qTts);
    });
    headBtns.appendChild(qTts);
    var qCheck = document.createElement("button");
    qCheck.className = "btn small ghost";
    qCheck.textContent = "🔍 Check my answer";
    qCheck.title = "The coach checks whether your answer is complete and suggests follow-up questions";
    qCheck.addEventListener("click", function () { runCardCheck(q, card); });
    headBtns.appendChild(qCheck);
    head.appendChild(headBtns);
    card.appendChild(head);

    var checkOut = document.createElement("div");
    checkOut.className = "check-output";
    checkOut.style.display = "none";
    card.appendChild(checkOut);

    var answersWrap = document.createElement("div");
    answersWrap.className = "answers-wrap";
    card.appendChild(answersWrap);

    // Render one answer editor block per existing answer (or one blank to start).
    function answerEditor(a0, idx) {
      // holder keeps the CURRENT saved row: fixes autosave re-inserting a new row
      // on every keystroke for answers that started blank.
      var holder = { a: a0 };
      var block = document.createElement("div");
      block.className = "answer-block";
      if (list.length > 1) {
        var lbl = document.createElement("div");
        lbl.className = "answer-label";
        lbl.textContent = "Answer " + (idx + 1);
        block.appendChild(lbl);
      }
      var ta = document.createElement("textarea");
      ta.className = "answer-box";
      ta.rows = 5;
      ta.placeholder = "Write your answer here…";
      ta.value = holder.a ? holder.a.body_text || "" : "";
      ta.setAttribute("aria-label", "Answer " + (idx + 1) + " to: " + q.prompt_text);
      block.appendChild(ta);

      var meta = document.createElement("div");
      meta.className = "qcard-meta";
      var wc = document.createElement("span");
      wc.className = "wordcount";
      wc.textContent = words(ta.value) + " words";
      var status = document.createElement("span");
      status.className = "save-status";
      status.textContent = holder.a ? "saved " + timeAgo(holder.a.updated_at) : "not saved yet";
      var ttsA = document.createElement("button");
      ttsA.className = "btn small ghost tts-btn";
      ttsA.textContent = "🔊";
      ttsA.title = "Read this answer out loud";
      ttsA.setAttribute("aria-label", "Read answer out loud");
      ttsA.addEventListener("click", function () {
        TTS.toggle(ta.value || "(nothing written yet)", ttsA);
      });
      var shareWrap = document.createElement("label");
      shareWrap.className = "share-toggle";
      var share = document.createElement("input");
      share.type = "checkbox";
      share.checked = holder.a ? !!holder.a.is_shared : !!me.share_by_default;
      share.addEventListener("change", function () {
        saveAnswer(q, holder.a, ta, share, status, wc, true).then(function (saved) {
          if (saved) { holder.a = saved; refreshAttachments(); }
        });
      });
      shareWrap.appendChild(share);
      shareWrap.appendChild(document.createTextNode(" Share with room"));
      meta.appendChild(wc);
      meta.appendChild(status);
      meta.appendChild(ttsA);
      meta.appendChild(shareWrap);
      block.appendChild(meta);

      // Attachments: docs / images / text files on this answer.
      var attWrap = document.createElement("div");
      attWrap.className = "attachments";
      block.appendChild(attWrap);
      var attBtn = document.createElement("button");
      attBtn.className = "btn small ghost";
      attBtn.textContent = "📎 Attach a file";
      attBtn.title = "Attach a document, image, or text file to this answer";
      attBtn.addEventListener("click", function () {
        attachFileToAnswer(q, holder, ta, attWrap, attBtn);
      });
      block.appendChild(attBtn);
      function refreshAttachments() {
        if (holder.a && holder.a.id) loadAttachments(holder.a.id, attWrap);
      }
      refreshAttachments();

      ta.addEventListener("input", function () {
        wc.textContent = words(ta.value) + " words";
        status.textContent = "typing…";
        var tkey = (holder.a && holder.a.id) ? holder.a.id : "new_" + q.id + "_" + idx;
        clearTimeout(autosaveTimers[tkey]);
        autosaveTimers[tkey] = setTimeout(function () {
          saveAnswer(q, holder.a, ta, share, status, wc, false).then(function (saved) {
            if (saved) { holder.a = saved; refreshAttachments(); }
          });
        }, 900);
      });

      return { block: block, setAnswer: function (na) { holder.a = na; refreshAttachments(); } };
    }

    var editors = [];
    if (list.length) {
      list.forEach(function (a, i) { var e = answerEditor(a, i); editors.push(e); answersWrap.appendChild(e.block); });
    } else {
      var e0 = answerEditor(null, 0); editors.push(e0); answersWrap.appendChild(e0.block);
    }

    // "Add another answer" — appends a fresh blank editor for this question.
    var addRow = document.createElement("div");
    addRow.className = "qcard-add";
    var addBtn = document.createElement("button");
    addBtn.className = "btn small ghost";
    addBtn.textContent = "＋ Add another answer";
    addBtn.addEventListener("click", function () {
      var e = answerEditor(null, editors.length);
      editors.push(e);
      answersWrap.appendChild(e.block);
      // Re-label all blocks now that there's more than one.
      var blocks = answersWrap.querySelectorAll(".answer-block");
      blocks.forEach(function (b, i) {
        var l = b.querySelector(".answer-label");
        if (!l) { l = document.createElement("div"); l.className = "answer-label"; b.insertBefore(l, b.firstChild); }
        l.textContent = "Answer " + (i + 1);
      });
      e.block.querySelector("textarea").focus();
    });
    addRow.appendChild(addBtn);
    card.appendChild(addRow);

    // per-question voice recorder
    var recRow = document.createElement("div");
    recRow.className = "qcard-rec";
    var recBtn = document.createElement("button");
    recBtn.className = "btn small";
    recBtn.textContent = "🎙 Record voice answer";
    var recStatus = document.createElement("span");
    recStatus.className = "save-status";
    recStatus.style.marginLeft = "10px";
    var recState = { recorder: null, chunks: [], start: 0 };
    recBtn.addEventListener("click", function () {
      toggleQuestionRecording(q, recBtn, recState, recStatus);
    });
    recRow.appendChild(recBtn);
    recRow.appendChild(recStatus);
    card.appendChild(recRow);

    return card;
  }

  // Coach completeness check for a whole question card: uses the first
  // non-empty answer, shows the check inline.
  function runCardCheck(q, card) {
    var out = card.querySelector(".check-output");
    var list = answers[q.id] || [];
    var a = list.find(function (x) { return (x.body_text || "").trim().length > 0; });
    if (!a) {
      out.style.display = "block";
      out.innerHTML = '<div class="support-note warn">Write an answer first — then tap this button and the coach will check it.</div>';
      return;
    }
    var res = Coach.checkAnswer(q, a.body_text);
    out.style.display = "block";
    out.innerHTML = '<div class="support-note ok"><strong>Coach’s answer check</strong></div>' +
      '<pre class="coach-pre">' + esc(res.output || res.error) + "</pre>";
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function saveAnswer(q, existing, ta, shareEl, statusEl, wcEl, fromToggle) {
    var body = ta.value;
    var row = {
      writer_id: me.id,
      question_id: q.id,
      body_text: body,
      word_count: words(body),
      is_shared: !!(shareEl && shareEl.checked),
      updated_at: new Date().toISOString()
    };
    try {
      var r;
      if (existing && existing.id) {
        row.id = existing.id;
        r = await FR.db().from("answers").upsert(row, { onConflict: "id" }).select().single();
      } else {
        r = await FR.db().from("answers").insert(row).select().single();
      }
      if (r.error) throw r.error;
      // Refresh the in-memory list for this question.
      var lst = answers[q.id] || [];
      var ix = lst.findIndex(function (x) { return x.id === r.data.id; });
      if (ix >= 0) lst[ix] = r.data; else lst.push(r.data);
      answers[q.id] = lst;
      if (statusEl) statusEl.textContent = "saved " + timeAgo(r.data.updated_at);
      if (wcEl) wcEl.textContent = words(body) + " words";
      // Throttle activity logging: at most one answer_save per question per 2 minutes.
      var key = "ans_" + q.id, now = Date.now();
      if (!nudgeLogThrottle[key] || now - nudgeLogThrottle[key] > 120000) {
        nudgeLogThrottle[key] = now;
        await FR.logActivity(me.id, "answer_save", { question_id: q.id, words: words(body) });
      }
      renderProgress();
      return r.data;
    } catch (e) {
      if (statusEl) statusEl.textContent = "save failed — retrying";
      console.error(e);
      return null;
    }
  }

  /* ================= attachments (docs / images / text files on an answer) ================= */

  var ATTACH_MAX = 10 * 1024 * 1024; // 10 MB

  async function loadAttachments(answerId, wrap) {
    wrap.innerHTML = "";
    try {
      var r = await FR.db().from("answer_attachments").select("*").eq("answer_id", answerId).order("created_at");
      if (r.error) throw r.error;
      (r.data || []).forEach(function (att) {
        var d = document.createElement("div");
        d.className = "att-item";
        var link = document.createElement("button");
        link.className = "linklike";
        link.textContent = "📄 " + att.file_name;
        link.title = "Download " + att.file_name;
        link.addEventListener("click", async function () {
          try {
            var dl = await FR.db().storage.from("fredrock-attachments")
              .createSignedUrl(att.storage_path, 3600);
            if (dl.error) throw dl.error;
            window.open(dl.data.signedUrl, "_blank", "noopener");
          } catch (e) { alert("Could not open file: " + (e.message || e)); }
        });
        d.appendChild(link);
        var del = document.createElement("button");
        del.className = "btn small danger ghost";
        del.textContent = "remove";
        del.addEventListener("click", async function () {
          if (!confirm("Remove this file?")) return;
          try {
            await FR.db().storage.from("fredrock-attachments").remove([att.storage_path]);
            var rr = await FR.db().from("answer_attachments").delete().eq("id", att.id);
            if (rr.error) throw rr.error;
            loadAttachments(answerId, wrap);
          } catch (e) { alert("Remove failed: " + (e.message || e)); }
        });
        d.appendChild(del);
        wrap.appendChild(d);
      });
    } catch (e) { console.error(e); }
  }

  // holder = { a } so we can save a blank answer first, then attach to its id.
  function attachFileToAnswer(q, holder, ta, wrap, btn, statusEl) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.doc,.docx,.txt,.md,.rtf,.jpg,.jpeg,.png,.gif,.webp";
    input.addEventListener("change", async function () {
      if (!input.files.length) return;
      var f = input.files[0];
      if (f.size > ATTACH_MAX) { alert("That file is too big — 10 MB max."); return; }
      btn.disabled = true;
      btn.textContent = "Uploading…";
      try {
        // Make sure the answer row exists before attaching.
        var ans = holder.a;
        if (!ans || !ans.id) {
          ans = await saveAnswer(q, ans, ta, null, statusEl || null, null, false);
          if (!ans || !ans.id) throw new Error("could not save the answer first");
          holder.a = ans;
        }
        var safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
        var path = me.id + "/" + ans.id + "/" + Date.now() + "_" + safeName;
        var up = await FR.db().storage.from("fredrock-attachments").upload(path, f, {
          contentType: f.type || "application/octet-stream"
        });
        if (up.error) throw up.error;
        var ins = await FR.db().from("answer_attachments").insert({
          answer_id: ans.id,
          writer_id: me.id,
          storage_path: path,
          file_name: f.name,
          mime_type: f.type || null,
          size_bytes: f.size
        }).select().single();
        if (ins.error) throw ins.error;
        await FR.logActivity(me.id, "attachment_add", { answer_id: ans.id, file: f.name });
        loadAttachments(ans.id, wrap);
      } catch (e) {
        alert("Upload failed: " + (e.message || e));
      } finally {
        btn.disabled = false;
        btn.textContent = "📎 Attach a file";
      }
    });
    input.click();
  }

  /* per-question voice recorder (mini version of Voice Studio) */
  function toggleQuestionRecording(q, btn, st, statusEl) {
    if (st.recorder && st.recorder.state !== "inactive") {
      st.recorder.stop();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Voice recording needs a browser with microphone support (Chrome or Edge recommended).");
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var rec = new MediaRecorder(stream);
      st.recorder = rec;
      st.chunks = [];
      st.start = Date.now();
      rec.ondataavailable = function (e) { if (e.data.size) st.chunks.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        btn.textContent = "🎙 Record voice answer";
        if (statusEl) statusEl.textContent = "uploading…";
        var blob = new Blob(st.chunks, { type: rec.mimeType || "audio/webm" });
        uploadRecording(blob, Math.round((Date.now() - st.start) / 1000), q.id, null, "", "web-speech")
          .then(function () {
            if (statusEl) statusEl.textContent = "✓ Voice answer saved and uploaded";
            loadRecordings(); renderProgress();
          })
          .catch(function (e) {
            if (statusEl) statusEl.textContent = "upload failed";
            alert("Upload failed: " + (e.message || e));
          });
      };
      rec.start();
      btn.textContent = "⏹ Stop recording";
    }).catch(function () {
      alert("Microphone permission was denied. Allow mic access to record.");
    });
  }

  /* shared upload path: {writer_id}/{recording_id}.webm -> fredrock-audio */
  async function uploadRecording(blob, durationSec, questionId, answerId, transcriptText, transcriptSource) {
    var c = FR.db();
    var recId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("r-" + Date.now() + "-" + Math.floor(Math.random() * 1e9));
    var path = me.id + "/" + recId + ".webm";
    var up = await c.storage.from("fredrock-audio").upload(path, blob, { contentType: blob.type || "audio/webm" });
    if (up.error) throw up.error;
    var ins = await c.from("recordings").insert({
      id: recId,
      writer_id: me.id,
      question_id: questionId || null,
      answer_id: answerId || null,
      storage_path: path,
      duration_sec: durationSec || null,
      transcript_text: transcriptText || "",
      transcript_source: transcriptSource || "web-speech"
    }).select().single();
    if (ins.error) throw ins.error;
    await FR.logActivity(me.id, "recording_save", { recording_id: recId, duration_sec: durationSec, question_id: questionId });
    if (transcriptText) await FR.logActivity(me.id, "transcript_save", { recording_id: recId, words: words(transcriptText) });
    return ins.data;
  }

  async function signedUrl(path) {
    var r = await FR.db().storage.from("fredrock-audio").createSignedUrl(path, 3600);
    if (r.error) throw r.error;
    return r.data.signedUrl;
  }

  function renderMyRecordings() {
    var list = $("my-recordings");
    if (!list) return;
    list.innerHTML = "";
    if (!myRecordings.length) {
      list.innerHTML = '<div class="empty">No recordings yet. Press record and tell your story.</div>';
      return;
    }
    myRecordings.slice(0, 12).forEach(function (rec) {
      var d = document.createElement("div");
      d.className = "rec-item";
      var q = questions.find(function (x) { return x.id === rec.question_id; });
      d.innerHTML = '<div class="rec-item-head"><strong>' + (q ? esc(q.prompt_text.slice(0, 60)) : "Voice note") + "</strong>" +
        '<span class="muted">' + timeAgo(rec.created_at) + (rec.duration_sec ? " · " + rec.duration_sec + "s" : "") + "</span></div>" +
        (rec.transcript_text ? '<p class="transcript">' + esc(rec.transcript_text.slice(0, 220)) + (rec.transcript_text.length > 220 ? "…" : "") + "</p>" : '<p class="muted">No transcript.</p>');
      var play = document.createElement("button");
      play.className = "btn small";
      play.textContent = "▶ Play";
      play.addEventListener("click", async function () {
        try {
          var url = await signedUrl(rec.storage_path);
          var a = document.createElement("audio");
          a.controls = true; a.src = url;
          d.appendChild(a);
          play.disabled = true;
        } catch (e) { alert("Could not load audio: " + (e.message || e)); }
      });
      d.appendChild(play);
      list.appendChild(d);
    });
  }
/* FredRock Writers Room — writer.js (part 2): Voice Studio, Script Studio, Coach, Room,
 * Resources, notifications, progress, nudge banner. Appends to the closure in part 1.
 * NOTE: this file is concatenated with part 1 inside one IIFE. Do not redeclare $/esc/etc.
 * (The final writer.js is a single file; parts are joined at write time.)
 */

/* ================= 2. Voice Studio ================= */

var vs = { recorder: null, stream: null, chunks: [], start: 0, timerInt: null, recognition: null, transcript: "" };

function initVoiceStudio() {
  var qsel = $("vs-question");
  qsel.innerHTML = '<option value="">— voice note (no question) —</option>';
  questions.forEach(function (q) {
    var o = document.createElement("option");
    o.value = q.id;
    o.textContent = q.prompt_text.slice(0, 70);
    qsel.appendChild(o);
  });
  $("vs-record").addEventListener("click", vsToggle);
  $("vs-save-transcript").addEventListener("click", vsSaveTranscript);
  renderVsSupport();
}

function renderVsSupport() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var note = $("vs-support-note");
  if (!SR) {
    note.innerHTML = "Live transcription isn't supported in this browser (works best in Chrome / Edge). " +
      "You can still record, then type or paste your transcript in the box below.";
    note.className = "support-note warn";
  } else {
    note.textContent = "Live transcription is on in this browser — speak and watch the words appear.";
    note.className = "support-note ok";
  }
}

function vsToggle() {
  if (vs.recorder && vs.recorder.state !== "inactive") { vsStop(); return; }
  vsStart();
}

function vsStart() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("This browser can't access the microphone. Use Chrome or Edge to record.");
    return;
  }
  vs.transcript = "";
  $("vs-transcript").value = "";
  $("vs-status").textContent = "requesting mic…";
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
    vs.stream = stream;
    var rec = new MediaRecorder(stream);
    vs.recorder = rec;
    vs.chunks = [];
    vs.start = Date.now();
    rec.ondataavailable = function (e) { if (e.data.size) vs.chunks.push(e.data); };
    rec.onstop = vsOnStop;
    rec.start();
    $("vs-record").textContent = "⏹ Stop";
    $("vs-record").classList.add("recording");
    $("vs-status").textContent = "recording…";
    vs.timerInt = setInterval(vsTick, 500);
    vsTick();
    vsStartSpeech();
  }).catch(function () {
    $("vs-status").textContent = "mic permission denied";
    alert("Microphone permission was denied. Allow mic access to record.");
  });
}

function vsTick() {
  var s = Math.floor((Date.now() - vs.start) / 1000);
  var m = Math.floor(s / 60), sec = s % 60;
  $("vs-timer").textContent = (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
}

function vsStartSpeech() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  try {
    var rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = function (e) {
      var text = "";
      for (var i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      vs.transcript = text;
      $("vs-transcript").value = text;
    };
    rec.onerror = function () { /* keep recording; manual transcript is the fallback */ };
    rec.onend = function () {
      // auto-restart while the mic is still recording
      if (vs.recorder && vs.recorder.state !== "inactive") {
        try { rec.start(); } catch (e2) {}
      }
    };
    vs.recognition = rec;
    rec.start();
  } catch (e) { /* feature-detected; manual fallback remains */ }
}

function vsStop() {
  if (vs.recognition) { try { vs.recognition.stop(); } catch (e) {} vs.recognition = null; }
  clearInterval(vs.timerInt);
  if (vs.recorder && vs.recorder.state !== "inactive") vs.recorder.stop();
}

function vsOnStop() {
  if (vs.stream) vs.stream.getTracks().forEach(function (t) { t.stop(); });
  $("vs-record").textContent = "🎙 Record";
  $("vs-record").classList.remove("recording");
  $("vs-status").textContent = "uploading…";
  var blob = new Blob(vs.chunks, { type: (vs.recorder && vs.recorder.mimeType) || "audio/webm" });
  var dur = Math.round((Date.now() - vs.start) / 1000);
  var qid = $("vs-question").value || null;
  var transcript = $("vs-transcript").value.trim() || vs.transcript.trim();
  uploadRecording(blob, dur, qid, null, transcript, window.SpeechRecognition || window.webkitSpeechRecognition ? "web-speech" : "manual")
    .then(function () {
      $("vs-status").textContent = "saved ✓";
      $("vs-transcript").value = "";
      vs.transcript = "";
      loadRecordings(); renderProgress();
    })
    .catch(function (e) {
      $("vs-status").textContent = "upload failed";
      alert("Upload failed: " + (e.message || e));
    });
}

function vsSaveTranscript() {
  // Saves the typed/edited transcript to the most recent recording.
  var text = $("vs-transcript").value.trim();
  if (!text) { alert("Nothing to save — the transcript box is empty."); return; }
  if (!myRecordings.length) { alert("Record something first, then save the transcript."); return; }
  var latest = myRecordings[0];
  FR.db().from("recordings").update({ transcript_text: text, transcript_source: "manual" }).eq("id", latest.id)
    .then(function (r) {
      if (r.error) throw r.error;
      latest.transcript_text = text;
      latest.transcript_source = "manual";
      $("vs-status").textContent = "transcript saved ✓";
      FR.logActivity(me.id, "transcript_save", { recording_id: latest.id, words: words(text) });
      renderMyRecordings();
    })
    .catch(function (e) { alert("Save failed: " + (e.message || e)); });
}

/* ================= 3. Script Studio ================= */

var studio = { scriptId: null, content: null }; // content = SnowfallForms.blankEpisode() shape

function initScriptStudio() {
  var sel = $("studio-select");
  sel.innerHTML = "";
  myScripts.forEach(function (s) {
    var o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.title + " (" + timeAgo(s.updated_at) + ")";
    sel.appendChild(o);
  });
  var add = document.createElement("option");
  add.value = "__new__";
  add.textContent = "+ New script…";
  sel.appendChild(add);
  sel.value = myScripts.length ? myScripts[0].id : "__new__";
  sel.addEventListener("change", function () {
    if (sel.value === "__new__") newStudioScript();
    else loadStudioScript(sel.value);
  });
  $("studio-new").addEventListener("click", newStudioScript);
  $("studio-save").addEventListener("click", saveStudioScript);
  if (myScripts.length) loadStudioScript(myScripts[0].id);
  else newStudioScript();
}

function newStudioScript() {
  studio.scriptId = null;
  studio.content = SnowfallForms.blankEpisode();
  $("studio-title").value = "";
  $("studio-logline").value = "";
  $("studio-share").checked = false;
  renderStudioForms();
  $("studio-status").textContent = "new script — unsaved";
}

function loadStudioScript(id) {
  var s = myScripts.find(function (x) { return x.id === id; });
  if (!s) { newStudioScript(); return; }
  studio.scriptId = s.id;
  studio.content = s.content_json && typeof s.content_json === "object" ? s.content_json : SnowfallForms.blankEpisode();
  // backfill any missing act keys from the template (template may have grown)
  SNOWFALL.episodeStructure.forEach(function (a) {
    if (!studio.content.acts) studio.content.acts = {};
    if (!studio.content.acts[a.key]) studio.content.acts[a.key] = SnowfallForms.blankAct(a.key);
  });
  if (!studio.content.bible) studio.content.bible = SnowfallForms.blankBible();
  if (!Array.isArray(studio.content.characters)) studio.content.characters = [SnowfallForms.blankCharacter()];
  $("studio-title").value = s.title || "";
  $("studio-logline").value = s.logline || "";
  $("studio-share").checked = !!s.is_shared;
  renderStudioForms();
  $("studio-status").textContent = "loaded — " + words(JSON.stringify(studio.content)) + " words of draft";
}

function renderStudioForms() {
  renderBible();
  renderActs();
  renderCharacters();
  updateStudioWordCount();
}

function bindField(obj, key, input) {
  input.value = obj[key] || "";
  input.addEventListener("input", function () {
    obj[key] = input.value;
    updateStudioWordCount();
  });
}

function renderBible() {
  var wrap = $("studio-bible");
  wrap.innerHTML = "<h4>Series Bible</h4>";
  SNOWFALL.seriesBible.fields.forEach(function (f) {
    var d = document.createElement("div");
    d.className = "field";
    var label = "<label>" + esc(f.label) + (f.hint ? ' <span class="muted">— ' + esc(f.hint) + "</span>" : "") + "</label>";
    if (f.checklist) {
      var checked = studio.content.bible[f.key + "_checked"] || [];
      var box = '<div class="checklist">';
      f.checklist.forEach(function (item) {
        var on = checked.indexOf(item) >= 0;
        box += '<label class="check"><input type="checkbox" data-item="' + esc(item) + '"' + (on ? " checked" : "") + "> " + esc(item) + "</label>";
      });
      box += "</div>";
      d.innerHTML = label + box;
      d.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
        cb.addEventListener("change", function () {
          var arr = studio.content.bible[f.key + "_checked"] || [];
          var it = cb.dataset.item;
          var i = arr.indexOf(it);
          if (cb.checked && i < 0) arr.push(it);
          if (!cb.checked && i >= 0) arr.splice(i, 1);
          studio.content.bible[f.key + "_checked"] = arr;
        });
      });
    } else {
      var ta = document.createElement("textarea");
      ta.rows = f.key === "premise" || f.key === "logline" ? 2 : 3;
      ta.placeholder = f.placeholder || "";
      bindField(studio.content.bible, f.key, ta);
      d.innerHTML = label;
      d.appendChild(ta);
    }
    wrap.appendChild(d);
  });
}

function renderActs() {
  var wrap = $("studio-acts");
  wrap.innerHTML = "<h4>Episode Builder</h4>";
  SNOWFALL.episodeStructure.forEach(function (actDef) {
    var act = studio.content.acts[actDef.key];
    var sec = document.createElement("details");
    sec.className = "act";
    sec.open = actDef.key === "teaser" || actDef.key === "act1";
    var beats = actDef.beats.map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("");
    var sum = document.createElement("summary");
    sum.innerHTML = "<strong>" + esc(actDef.label) + "</strong> <span class='muted'>" + esc(actDef.purpose) + "</span>";
    sec.appendChild(sum);

    var beatBox = document.createElement("div");
    beatBox.className = "beat-prompts";
    beatBox.innerHTML = "<em>Beat prompts:</em><ol>" + beats + "</ol>";
    sec.appendChild(beatBox);

    var notes = document.createElement("textarea");
    notes.rows = 2;
    notes.placeholder = "Act notes / outline…";
    bindField(act, "notes", notes);
    var nl = document.createElement("div");
    nl.className = "field";
    nl.innerHTML = "<label>Act notes</label>";
    nl.appendChild(notes);
    sec.appendChild(nl);

    var scenesDiv = document.createElement("div");
    scenesDiv.className = "scenes";
    scenesDiv.innerHTML = "<label>Scenes</label>";
    act.scenes.forEach(function (sc, idx) { scenesDiv.appendChild(sceneEditor(act, sc, idx, function () { renderActs(); updateStudioWordCount(); })); });
    var addBtn = document.createElement("button");
    addBtn.className = "btn small ghost";
    addBtn.textContent = "+ Add scene";
    addBtn.addEventListener("click", function () {
      act.scenes.push(SnowfallForms.blankScene());
      renderActs(); updateStudioWordCount();
    });
    scenesDiv.appendChild(addBtn);
    sec.appendChild(scenesDiv);
    wrap.appendChild(sec);
  });
}

function sceneEditor(act, sc, idx, rerender) {
  var d = document.createElement("div");
  d.className = "scene";
  d.innerHTML = "<div class='scene-head'><strong>Scene " + (idx + 1) + "</strong></div>";
  SNOWFALL.sceneFields.forEach(function (f) {
    var fd = document.createElement("div");
    fd.className = "field inline";
    fd.innerHTML = "<label>" + esc(f.label) + "</label>";
    var inp = (f.multiline || f.key === "action") ? document.createElement("textarea") : document.createElement("input");
    if (inp.tagName === "TEXTAREA") inp.rows = 2;
    inp.placeholder = f.placeholder || "";
    bindField(sc, f.key, inp);
    fd.appendChild(inp);
    d.appendChild(fd);
  });
  var del = document.createElement("button");
  del.className = "btn small danger ghost";
  del.textContent = "Remove scene";
  del.addEventListener("click", function () {
    act.scenes.splice(idx, 1);
    rerender();
  });
  d.appendChild(del);
  return d;
}

function renderCharacters() {
  var wrap = $("studio-characters");
  wrap.innerHTML = "<h4>Character Sheets</h4>";
  studio.content.characters.forEach(function (c, idx) {
    var d = document.createElement("div");
    d.className = "character-card";
    d.innerHTML = "<div class='scene-head'><strong>Character " + (idx + 1) + "</strong></div>";
    SNOWFALL.characterSheet.fields.forEach(function (f) {
      var fd = document.createElement("div");
      fd.className = "field inline";
      fd.innerHTML = "<label>" + esc(f.label) + (f.hint ? ' <span class="muted">— ' + esc(f.hint) + "</span>" : "") + "</label>";
      var inp = document.createElement(f.key === "want" || f.key === "need" ? "textarea" : "input");
      if (inp.tagName === "TEXTAREA") inp.rows = 2;
      inp.placeholder = f.placeholder || "";
      bindField(c, f.key, inp);
      fd.appendChild(inp);
      d.appendChild(fd);
    });
    var del = document.createElement("button");
    del.className = "btn small danger ghost";
    del.textContent = "Remove character";
    del.addEventListener("click", function () {
      studio.content.characters.splice(idx, 1);
      renderCharacters(); updateStudioWordCount();
    });
    d.appendChild(del);
    wrap.appendChild(d);
  });
  var add = document.createElement("button");
  add.className = "btn small ghost";
  add.textContent = "+ Add character";
  add.addEventListener("click", function () {
    studio.content.characters.push(SnowfallForms.blankCharacter());
    renderCharacters(); updateStudioWordCount();
  });
  wrap.appendChild(add);
}

function studioWordCount() {
  return words(JSON.stringify(studio.content)) + words($("studio-title").value) + words($("studio-logline").value);
}

function updateStudioWordCount() {
  var el = $("studio-words");
  if (el) el.textContent = studioWordCount() + " words";
}

async function saveStudioScript() {
  var title = $("studio-title").value.trim();
  if (!title) { alert("Give the script a title first."); return; }
  var row = {
    writer_id: me.id,
    title: title,
    logline: $("studio-logline").value.trim() || null,
    format: "fredrock_drama",
    content_json: studio.content,
    word_count: studioWordCount(),
    is_shared: $("studio-share").checked,
    updated_at: new Date().toISOString()
  };
  $("studio-status").textContent = "saving…";
  try {
    var r;
    if (studio.scriptId) {
      r = await FR.db().from("scripts").update(row).eq("id", studio.scriptId).select().single();
    } else {
      r = await FR.db().from("scripts").insert(row).select().single();
    }
    if (r.error) throw r.error;
    studio.scriptId = r.data.id;
    var i = myScripts.findIndex(function (x) { return x.id === r.data.id; });
    if (i >= 0) myScripts[i] = r.data; else myScripts.unshift(r.data);
    $("studio-status").textContent = "saved ✓ " + timeAgo(r.data.updated_at);
    await FR.logActivity(me.id, "script_save", { script_id: r.data.id, words: r.data.word_count });
    renderProgress();
    initScriptStudioSelectOnly();
  } catch (e) {
    $("studio-status").textContent = "save failed";
    alert("Save failed: " + (e.message || e));
  }
}

function initScriptStudioSelectOnly() {
  // refresh the dropdown without rebuilding forms
  var sel = $("studio-select");
  var cur = sel.value;
  sel.innerHTML = "";
  myScripts.forEach(function (s) {
    var o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.title + " (" + timeAgo(s.updated_at) + ")";
    sel.appendChild(o);
  });
  var add = document.createElement("option");
  add.value = "__new__";
  add.textContent = "+ New script…";
  sel.appendChild(add);
  sel.value = studio.scriptId || "__new__";
}

/* ================= 4. Writing Coach ================= */

var coachTool = "expand";

function initCoach() {
  var st = Coach.aiStatus();
  $("coach-ai-status").textContent = st.message;
  $("coach-ai-status").className = "support-note " + (st.configured ? "ok" : "warn");
  // question picker for the "Check my answer" tool
  var qsel = $("coach-question");
  if (qsel) {
    qsel.innerHTML = "";
    questions.forEach(function (q) {
      var o = document.createElement("option");
      o.value = q.id;
      o.textContent = q.prompt_text.slice(0, 80);
      qsel.appendChild(o);
    });
  }
  document.querySelectorAll("[data-coach-tool]").forEach(function (b) {
    b.addEventListener("click", function () {
      coachTool = b.dataset.coachTool;
      document.querySelectorAll("[data-coach-tool]").forEach(function (x) { x.classList.toggle("active", x === b); });
      $("coach-tool-name").textContent = b.textContent;
      $("coach-input").placeholder = b.dataset.placeholder || "Type here…";
      var qw = $("coach-question-wrap");
      if (qw) qw.style.display = coachTool === "check" ? "block" : "none";
    });
  });
  $("coach-run").addEventListener("click", coachRunLocal);
  $("coach-ask-ai").addEventListener("click", coachAskAi);
}

function coachRunLocal() {
  var input = $("coach-input").value;
  var res;
  if (coachTool === "expand") res = Coach.expandPrompt(input);
  else if (coachTool === "beats") res = Coach.beatSheet(input);
  else if (coachTool === "dialogue") res = Coach.dialoguePolish(input);
  else if (coachTool === "check") {
    var qid = $("coach-question") ? $("coach-question").value : null;
    var q = questions.find(function (x) { return x.id === qid; }) || null;
    res = Coach.checkAnswer(q, input);
  }
  else res = Coach.characterSheet(input);
  var out = $("coach-output");
  if (res.error) { out.textContent = res.error; out.classList.add("error"); }
  else { out.textContent = res.output; out.classList.remove("error"); }
}

async function coachAskAi() {
  var input = $("coach-input").value.trim();
  var out = $("coach-output");
  if (!input) { out.textContent = "Type something first."; out.classList.add("error"); return; }
  out.textContent = "Asking the AI…";
  out.classList.remove("error");
  var prompts = {
    expand: "You are a TV writing coach. Expand this spark into a fuller scene sketch with world, want, obstacle, cost, and one strong image.",
    beats: "You are a TV writing coach. Build a beat sheet for this episode idea using a Snowfall-style structure: teaser, five acts, tag.",
    dialogue: "You are a TV writing coach. Polish this dialogue: flag on-the-nose lines, filler, and voice issues, then suggest tighter alternatives.",
    character: "You are a TV writing coach. Build a want-vs-need character worksheet for this character.",
    check: "You are a TV writing coach for the FredRock series (a Snowfall-style drama about Frederick, MD). " +
      "The writer pasted an answer to an origin question. Judge whether the answer FULLY addresses the question: " +
      "check coverage of when/where/who/why/how-it-felt/sense-detail, name what is missing, then ask 3 SPECIFIC " +
      "follow-up questions tailored to this exact question (not generic ones) to draw out perspective, background, " +
      "and era detail. End with the rule: one named place, one named person, one sense detail, one feeling shown through action."
  };
  var sysPrompt = prompts[coachTool] || prompts.expand;
  if (coachTool === "check") {
    var cq = questions.find(function (x) { return x.id === ($("coach-question") ? $("coach-question").value : null); });
    if (cq) sysPrompt += " The question being answered is: \"" + cq.prompt_text + "\" " + (cq.help_text || "");
  }
  var res = await Coach.callAiEndpoint([
    { role: "system", content: sysPrompt },
    { role: "user", content: input }
  ]);
  if (res.error) { out.textContent = res.error; out.classList.add("error"); }
  else { out.textContent = res.output; out.classList.remove("error"); }
}

/* ================= 5. Room (shared, read-only) ================= */

async function loadRoom() {
  var c = FR.db();
  var ra = await c.from("answers").select("*, writers(display_name)").eq("is_shared", true).neq("writer_id", me.id).order("updated_at", { ascending: false }).limit(50);
  var rs = await c.from("scripts").select("*, writers(display_name)").eq("is_shared", true).neq("writer_id", me.id).order("updated_at", { ascending: false }).limit(50);
  var wrap = $("room-list");
  wrap.innerHTML = "";
  var items = [];
  if (!ra.error) (ra.data || []).forEach(function (a) {
    items.push({ t: a.updated_at, kind: "answer", who: (a.writers && a.writers.display_name) || "a writer", title: "Answer", body: a.body_text, words: a.word_count });
  });
  if (!rs.error) (rs.data || []).forEach(function (s) {
    items.push({ t: s.updated_at, kind: "script", who: (s.writers && s.writers.display_name) || "a writer", title: s.title, body: s.logline || "", words: s.word_count });
  });
  items.sort(function (a, b) { return new Date(b.t) - new Date(a.t); });
  if (!items.length) {
    wrap.innerHTML = '<div class="empty">Nothing shared yet. When writers share answers or scripts, they appear here.</div>';
    return;
  }
  items.forEach(function (it) {
    var d = document.createElement("div");
    d.className = "room-item";
    d.innerHTML = '<div class="room-item-head"><span class="badge">' + esc(it.kind) + "</span><strong>" + esc(it.title) + "</strong>" +
      '<span class="muted">by ' + esc(it.who) + " · " + timeAgo(it.t) + (it.words ? " · " + it.words + " words" : "") + "</span></div>" +
      '<p>' + esc((it.body || "").slice(0, 600)) + ((it.body || "").length > 600 ? "…" : "") + "</p>";
    wrap.appendChild(d);
  });
}

/* ================= 6. Resources ================= */

async function loadResources() {
  var r = await FR.db().from("resources").select("*").order("sort_order");
  var wrap = $("resources-list");
  wrap.innerHTML = "";
  if (r.error || !(r.data || []).length) {
    wrap.innerHTML = '<div class="empty">No resources yet.</div>';
    return;
  }
  r.data.forEach(function (res) {
    var d = document.createElement("details");
    d.className = "resource";
    d.innerHTML = "<summary><strong>" + esc(res.title) + "</strong> <span class='muted'>" + esc(res.kind || "guide") + "</span></summary>";
    var body = document.createElement("div");
    body.className = "resource-body";
    body.innerHTML = mdLight(res.body_md || "");
    if (res.url) {
      var a = document.createElement("a");
      a.href = res.url; a.target = "_blank"; a.rel = "noopener";
      a.textContent = res.url;
      body.appendChild(a);
    }
    d.appendChild(body);
    wrap.appendChild(d);
  });
}

// tiny markdown: headings, bold, lists, paragraphs — no dependency
function mdLight(md) {
  var html = esc(md);
  html = html.replace(/^### (.*)$/gm, "<h4>$1</h4>")
             .replace(/^## (.*)$/gm, "<h3>$1</h3>")
             .replace(/^# (.*)$/gm, "<h2>$1</h2>")
             .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
             .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, function (m) { return "<ul>" + m + "</ul>"; });
  html = html.replace(/^(?!<)(\S.*)$/gm, "<p>$1</p>");
  return html;
}

/* ================= header: notifications, progress, nudge banner ================= */

async function loadNotifications() {
  var r = await FR.db().from("notifications").select("*").eq("writer_id", me.id).order("created_at", { ascending: false }).limit(20);
  var notes = (!r.error && r.data) ? r.data : [];
  var unread = notes.filter(function (n) { return !n.is_read; });
  var bell = $("notif-bell");
  bell.textContent = "🔔" + (unread.length ? " (" + unread.length + ")" : "");
  bell.classList.toggle("has-unread", unread.length > 0);
  var panel = $("notif-panel");
  panel.innerHTML = notes.length ? "" : '<div class="empty">No notifications.</div>';
  notes.forEach(function (n) {
    var d = document.createElement("div");
    d.className = "notif" + (n.is_read ? "" : " unread");
    d.innerHTML = "<strong>" + esc(n.title) + "</strong><p>" + esc(n.body) + "</p>" +
      '<span class="muted">' + timeAgo(n.created_at) + "</span>";
    panel.appendChild(d);
  });
  bell.onclick = function (e) {
    e.stopPropagation();
    panel.style.display = panel.style.display === "block" ? "none" : "block";
    if (unread.length) {
      FR.db().from("notifications").update({ is_read: true }).eq("writer_id", me.id).eq("is_read", false)
        .then(function () { loadNotifications(); });
    }
  };
  document.addEventListener("click", function () { panel.style.display = "none"; });
}

function renderProgress() {
  var answeredQs = 0, totalAnswers = 0, totalWords = 0;
  Object.keys(answers).forEach(function (k) {
    var list = answers[k] || [];
    var nonEmpty = list.filter(function (a) { return (a.body_text || "").trim().length > 0; });
    if (nonEmpty.length) answeredQs++;
    totalAnswers += nonEmpty.length;
    nonEmpty.forEach(function (a) { totalWords += (a.word_count || 0); });
  });
  var scriptsN = myScripts.length;
  var recsN = myRecordings.length;
  var totalQ = questions.length;
  var el = $("progress-glance");
  el.innerHTML =
    "<span>📝 " + answeredQs + "/" + totalQ + " questions</span>" +
    "<span>💬 " + totalAnswers + " answers</span>" +
    "<span>✍️ " + totalWords + " words</span>" +
    "<span>🎙 " + recsN + " recordings</span>" +
    "<span>🎬 " + scriptsN + " scripts</span>";
}

async function checkNudgeBanner() {
  // inactivity = no activity_log rows newer than the threshold (heartbeat keeps
  // last_active_at fresh on every visit, so activity_log is the honest signal)
  var r = await FR.db().from("activity_log").select("created_at").eq("writer_id", me.id).order("created_at", { ascending: false }).limit(1);
  var last = (!r.error && r.data && r.data.length) ? r.data[0].created_at : me.created_at;
  if (!last) return;
  var days = (Date.now() - new Date(last).getTime()) / 86400000;
  if (days > nudgeDays) {
    var b = $("nudge-banner");
    b.style.display = "block";
    b.innerHTML = "🎬 <strong>The room misses your voice…</strong> It's been " + Math.floor(days) +
      " days since your last session. Pick up a question — the story is waiting.";
  }
}

/* ================= 7. Help (plain-words guide for non-technical writers) ================= */

function renderHelp() {
  var el = $("help-body");
  if (!el) return;
  var ttsNote = TTS.supported()
    ? "Tap the 🔊 button next to any question or answer to hear it read out loud."
    : "Read-aloud works best in Chrome or Edge — tap 🔊 next to any question to try it.";
  el.innerHTML =
    '<div class="help-grid">' +
    helpCard("Answering a question",
      "<ol><li>Tap the <strong>Questions</strong> tab at the top.</li>" +
      "<li>Find your question. Type your answer in the big box.</li>" +
      "<li>It <strong>saves by itself</strong> as you type — watch for the word “saved” under the box. You don't need to press anything.</li>" +
      "<li>The <strong>word count</strong> next to it shows your progress: “45 words.”</li></ol>") +
    helpCard("Adding more to an answer",
      "<ol><li>Scroll back to the question any time — your words are still there.</li>" +
      "<li>Type more in the same box, or tap <strong>＋ Add another answer</strong> to start a fresh one (Answer 2, Answer 3…).</li>" +
      "<li>Each answer has its own word count and its own “saved” line.</li></ol>") +
    helpCard("Recording your voice",
      "<ol><li>On any question, tap <strong>🎙 Record voice answer</strong>. Allow the microphone if asked.</li>" +
      "<li>Talk. When you're done, tap <strong>⏹ Stop</strong>.</li>" +
      "<li>You will see <strong>“✓ Voice answer saved and uploaded”</strong> — that means it worked.</li>" +
      "<li>In <strong>Voice Studio</strong> you can link a recording to a question and save a transcript.</li>" +
      "<li>Live transcription works in Chrome / Edge. In other browsers, type or paste your transcript in the box.</li></ol>") +
    helpCard("Attaching files",
      "<ol><li>Under any answer, tap <strong>📎 Attach a file</strong>.</li>" +
      "<li>Pick a document, photo, or text file (10&nbsp;MB max).</li>" +
      "<li>It uploads and appears under the answer. Tap the file name to open it; “remove” deletes it.</li></ol>") +
    helpCard("Listening instead of reading",
      "<ol><li>" + esc(ttsNote) + "</li>" +
      "<li>Tap <strong>⏹</strong> to stop the reading.</li></ol>") +
    helpCard("Checking your answer is complete",
      "<ol><li>On any question, tap <strong>🔍 Check my answer</strong>.</li>" +
      "<li>The coach shows what your answer covers and what's missing — and asks you <strong>specific follow-up questions</strong> to draw out more.</li>" +
      "<li>Answer the follow-ups right in the box to strengthen the story.</li></ol>") +
    helpCard("Moving between questions",
      "<ol><li>All questions are on the <strong>Questions</strong> tab — just scroll.</li>" +
      "<li>Your progress at the top shows how many questions you've answered.</li>" +
      "<li>You can answer in any order and skip around freely.</li></ol>") +
    helpCard("Sharing with the room",
      "<ol><li>Each answer has a <strong>“Share with room”</strong> checkbox.</li>" +
      "<li>Checked = the other writers can read it in the <strong>Room</strong> tab. Unchecked = only you and Black see it.</li>" +
      "<li>You can change this any time.</li></ol>") +
    helpCard("Putting the room on your phone",
      "<ol><li><strong>iPhone (Safari):</strong> Share button → “Add to Home Screen” → Add.</li>" +
      "<li><strong>Android (Chrome):</strong> three dots ⋮ → “Add to Home screen” (or “Install app”).</li>" +
      "<li><strong>Computer:</strong> browser menu → “Install” if offered.</li></ol>") +
    "</div>";
}

function helpCard(title, bodyHtml) {
  return '<details class="help-card" open><summary><strong>' + esc(title) + "</strong></summary><div>" + bodyHtml + "</div></details>";
}

/* ================= avatar (profile photo) ================= */

function avatarHtml(url, name, size) {
  size = size || 40;
  if (url) {
    return '<img class="avatar" style="width:' + size + 'px;height:' + size + 'px" src="' + esc(url) + '" alt="' + esc(name || "") + '">';
  }
  var initials = (name || "?").trim().split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
  return '<span class="avatar avatar-initials" style="width:' + size + 'px;height:' + size + 'px" aria-hidden="true">' + esc(initials) + "</span>";
}

function initAvatar() {
  var who = $("who-line");
  if (!who) return;
  var wrap = document.createElement("span");
  wrap.className = "who-avatar";
  wrap.innerHTML = avatarHtml(me.avatar_url, me.display_name, 36);
  wrap.title = "Tap to change your profile photo";
  var file = document.createElement("input");
  file.type = "file";
  file.accept = "image/*";
  file.style.display = "none";
  wrap.style.cursor = "pointer";
  wrap.addEventListener("click", function () { file.click(); });
  file.addEventListener("change", function () {
    if (file.files.length) uploadAvatar(file.files[0], wrap);
  });
  who.parentNode.insertBefore(wrap, who);
}

async function uploadAvatar(f, wrapEl) {
  if (f.size > 5 * 1024 * 1024) { alert("That photo is too big — pick one under 5 MB."); return; }
  try {
    var ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "jpg";
    var path = me.id + "/avatar." + ext;
    var up = await FR.db().storage.from("fredrock-avatars").upload(path, f, {
      contentType: f.type || "image/jpeg",
      upsert: true
    });
    if (up.error) throw up.error;
    var pub = FR.db().storage.from("fredrock-avatars").getPublicUrl(path);
    var url = pub.data && pub.data.publicUrl;
    if (!url) throw new Error("no public URL");
    // cache-bust so the new photo shows immediately
    url += (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + Date.now();
    var r = await FR.db().from("writers").update({ avatar_url: url }).eq("id", me.id);
    if (r.error) throw r.error;
    me.avatar_url = url;
    if (wrapEl) wrapEl.innerHTML = avatarHtml(url, me.display_name, 36);
    await FR.logActivity(me.id, "avatar_update", {});
  } catch (e) {
    alert("Photo upload didn't work: " + (e.message || e));
  }
  return me.avatar_url;
}

/* ================= first-run onboarding ================= */

function maybeOnboard() {
  if (typeof window.Onboard === "undefined") return;
  window.Onboard.maybeShow(me, {
    onPhoto: function (file) { return uploadAvatar(file, null); },
    onDone: async function () {
      try {
        await FR.db().from("writers").update({ onboarded_at: new Date().toISOString() }).eq("id", me.id);
        me.onboarded_at = new Date().toISOString();
      } catch (e) { console.error(e); }
    }
  });
}

})();
