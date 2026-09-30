/* FredRock Writers Room — tts.js
 * Read-aloud: browser-native Web Speech synthesis, $0, no network.
 * Writers can hear any question and any answer read back.
 * Exposes window.TTS = { supported(), speak(text), stop(), speaking(), toggle(text) }
 */
(function () {
  "use strict";

  function supported() {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  var currentUtter = null;

  function stop() {
    if (!supported()) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}
    currentUtter = null;
    document.querySelectorAll(".tts-btn.speaking").forEach(function (b) {
      b.classList.remove("speaking");
      b.textContent = "🔊";
      b.setAttribute("aria-pressed", "false");
    });
  }

  function pickVoice() {
    try {
      var voices = window.speechSynthesis.getVoices() || [];
      // Prefer an English voice; otherwise fall back to the default.
      var en = voices.filter(function (v) { return /^en/i.test(v.lang); });
      return (en[0] || voices[0]) || null;
    } catch (e) { return null; }
  }

  // Speak plain text. btn (optional) is the button that triggered it — it gets
  // a "speaking" state and turns into a stop button while reading.
  function speak(text, btn) {
    if (!supported()) {
      alert("Read-aloud isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return;
    // Long answers: chunk so the browser doesn't drop the tail.
    var chunks = t.match(/[^.!?]+[.!?]+|\S.{0,300}(?=\s|$)/g) || [t];
    stop();
    var voice = pickVoice();
    chunks.forEach(function (chunk, i) {
      var u = new SpeechSynthesisUtterance(chunk);
      if (voice) u.voice = voice;
      u.rate = 1;
      if (i === 0) {
        currentUtter = u;
        if (btn) {
          btn.classList.add("speaking");
          btn.textContent = "⏹";
          btn.setAttribute("aria-pressed", "true");
        }
      }
      if (i === chunks.length - 1) {
        u.onend = function () { stop(); };
        u.onerror = function () { stop(); };
      }
      window.speechSynthesis.speak(u);
    });
  }

  function speaking() {
    return !!(currentUtter && supported() && window.speechSynthesis.speaking);
  }

  // Toggle: if this button's text is currently being read, stop; else read it.
  function toggle(text, btn) {
    if (btn && btn.classList.contains("speaking")) { stop(); return; }
    speak(text, btn);
  }

  // Warm up the voice list (some browsers load voices async).
  if (supported()) {
    try {
      window.speechSynthesis.getVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = function () {
          try { window.speechSynthesis.getVoices(); } catch (e) {}
        };
      }
    } catch (e) {}
  }

  window.TTS = {
    supported: supported,
    speak: speak,
    stop: stop,
    speaking: speaking,
    toggle: toggle
  };
})();
