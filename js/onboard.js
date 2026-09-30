/* FredRock Writers Room — onboard.js
 * First-run onboarding: dead-simple welcome for non-technical writers.
 * Shown once, right after a writer claims an invite and lands in the room.
 * Written at a 5th-grade reading level: numbered steps, big buttons, no jargon.
 * Exposes window.Onboard = { maybeShow(writer, callbacks) }
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function deviceKind() {
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return "ios";
    if (/Android/.test(ua)) return "android";
    return "computer";
  }

  function installSteps() {
    var kind = deviceKind();
    if (kind === "ios") {
      return [
        "Open this page in <strong>Safari</strong>.",
        "Tap the <strong>Share</strong> button at the bottom of the screen (the square with the arrow).",
        "Tap <strong>“Add to Home Screen.”</strong>",
        "Tap <strong>Add</strong>. The room now has its own icon, like a real app."
      ];
    }
    if (kind === "android") {
      return [
        "Open this page in <strong>Chrome</strong>.",
        "Tap the <strong>three dots ⋮</strong> in the top-right corner.",
        "Tap <strong>“Add to Home screen”</strong> (or <strong>“Install app”</strong>).",
        "Tap <strong>Add</strong>. The room now has its own icon, like a real app."
      ];
    }
    return [
      "In your browser's menu, look for <strong>“Install”</strong> or <strong>“Add to Home screen.”</strong>",
      "(In Chrome: the three dots ⋮ at the top-right → “Install FredRock Writers Room.”)",
      "This gives the room its own window and icon — no more hunting for the tab."
    ];
  }

  var STEPS = [
    {
      num: 1,
      title: "Welcome to the room",
      body: "You are one of 10 writers building <strong>FredRock</strong> — a TV series about Frederick, " +
        "told by the people who lived it. Your stories are the raw material. There is no wrong answer."
    },
    {
      num: 2,
      title: "Answer the questions",
      body: "Tap <strong>Questions</strong> at the top. You will see <strong>Round 1: Origins</strong> — " +
        "6 questions. Type your answer in the box. It saves by itself as you type — you will see “saved.” " +
        "<br><br>Want to say it instead? Tap <strong>🎙 Record voice answer</strong> on any question and talk. " +
        "When you tap <strong>⏹ Stop</strong>, you will see <strong>“✓ Voice answer saved and uploaded”</strong> — " +
        "that means it worked. Come back any time and add more — answers are never locked."
    },
    {
      num: 3,
      title: "Put the room on your phone",
      body: "You can use the room right here in the browser. To make it feel like a real app:",
      list: installSteps()
    },
    {
      num: 4,
      title: "Add your photo (optional)",
      body: "Your picture shows next to your name on the group's progress board. Tap below to pick a photo.",
      photo: true
    },
    {
      num: 5,
      title: "That's it — start writing",
      body: "Tap <strong>Start writing</strong>. If you ever get lost, tap the <strong>Help</strong> tab at the top — " +
        "every step is written out there in plain words."
    }
  ];

  function buildOverlay(displayName) {
    var ov = document.createElement("div");
    ov.id = "onboard-overlay";
    ov.innerHTML =
      '<div class="onboard-card">' +
        '<div class="onboard-kicker">FREDROCK WRITERS ROOM</div>' +
        '<h2>Welcome, ' + esc(displayName || "writer") + ' 👋</h2>' +
        '<p class="muted">5 quick steps. About 2 minutes.</p>' +
        '<div id="onboard-body"></div>' +
        '<div class="onboard-nav">' +
          '<button class="btn ghost" id="onboard-back">← Back</button>' +
          '<span class="onboard-dots" id="onboard-dots"></span>' +
          '<button class="btn" id="onboard-next">Next →</button>' +
        '</div>' +
      '</div>';
    return ov;
  }

  function renderStep(body, step) {
    var html = '<div class="onboard-step">' +
      '<div class="onboard-stepnum">Step ' + step.num + " of " + STEPS.length + "</div>" +
      "<h3>" + step.title + "</h3>" +
      "<p>" + step.body + "</p>";
    if (step.list) {
      html += "<ol class='onboard-list'>";
      step.list.forEach(function (li) { html += "<li>" + li + "</li>"; });
      html += "</ol>";
    }
    if (step.photo) {
      html += '<div class="onboard-photo">' +
        '<img id="onboard-photo-preview" class="avatar-lg" style="display:none" alt="Your photo preview">' +
        '<div><button class="btn small" id="onboard-photo-btn">📷 Choose a photo</button> ' +
        '<button class="btn small ghost" id="onboard-photo-skip">Skip</button></div>' +
        '<input type="file" id="onboard-photo-file" accept="image/*" style="display:none">' +
        '<p class="muted" id="onboard-photo-status"></p></div>';
    }
    html += "</div>";
    body.innerHTML = html;
  }

  // callbacks: { onPhoto(file) -> Promise<string avatarUrl>, onDone() -> Promise }
  function maybeShow(writer, callbacks) {
    callbacks = callbacks || {};
    var done = false;
    try {
      done = !!(writer && writer.onboarded_at) ||
             window.localStorage.getItem("fr_onboarded_" + (writer ? writer.id : "x"));
    } catch (e) {}
    if (done) return;

    var ov = buildOverlay(writer && writer.display_name);
    document.body.appendChild(ov);
    var body = ov.querySelector("#onboard-body");
    var dots = ov.querySelector("#onboard-dots");
    var backBtn = ov.querySelector("#onboard-back");
    var nextBtn = ov.querySelector("#onboard-next");
    var ix = 0;

    function draw() {
      renderStep(body, STEPS[ix]);
      var d = "";
      for (var i = 0; i < STEPS.length; i++) d += '<span class="dot' + (i === ix ? " on" : "") + '"></span>';
      dots.innerHTML = d;
      backBtn.style.visibility = ix === 0 ? "hidden" : "visible";
      nextBtn.textContent = ix === STEPS.length - 1 ? "Start writing →" : "Next →";
      if (STEPS[ix].photo) wirePhoto(body);
    }

    function wirePhoto(scope) {
      var file = scope.querySelector("#onboard-photo-file");
      var btn = scope.querySelector("#onboard-photo-btn");
      var skip = scope.querySelector("#onboard-photo-skip");
      var prev = scope.querySelector("#onboard-photo-preview");
      var status = scope.querySelector("#onboard-photo-status");
      btn.addEventListener("click", function () { file.click(); });
      skip.addEventListener("click", function () { next(); });
      file.addEventListener("change", async function () {
        if (!file.files.length) return;
        var f = file.files[0];
        if (f.size > 5 * 1024 * 1024) { status.textContent = "That photo is too big — pick one under 5 MB."; return; }
        status.textContent = "Uploading…";
        try {
          var url = await callbacks.onPhoto(f);
          prev.src = url;
          prev.style.display = "block";
          status.textContent = "✓ Photo added.";
        } catch (e) {
          status.textContent = "Upload didn't work — you can add a photo later. (" + (e && e.message ? e.message : e) + ")";
        }
      });
    }

    function finish() {
      ov.parentNode.removeChild(ov);
      try { window.localStorage.setItem("fr_onboarded_" + writer.id, "1"); } catch (e) {}
      if (callbacks.onDone) callbacks.onDone();
    }

    function next() {
      if (ix < STEPS.length - 1) { ix++; draw(); }
      else finish();
    }

    backBtn.addEventListener("click", function () { if (ix > 0) { ix--; draw(); } });
    nextBtn.addEventListener("click", next);
    draw();
  }

  window.Onboard = { maybeShow: maybeShow };
})();
