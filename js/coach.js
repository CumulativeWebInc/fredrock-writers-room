/* FredRock Writers Room — coach.js
 * Writing Coach: two layers.
 *  (a) Built-in $0 local engine — prompt expansion, Snowfall beat-sheet generator,
 *      dialogue polish checklist, character want-vs-need worksheet. No key needed.
 *  (b) Connect AI — an admin-configured OpenAI-compatible endpoint + key, stored in
 *      LOCALSTORAGE only (never in the database). coach.js calls it when configured;
 *      otherwise it returns an honest error so the UI can say what is and isn't live.
 *
 * Local AI settings keys: fr_ai_endpoint, fr_ai_model, fr_ai_key
 */
(function () {
  "use strict";

  function wordCount(text) {
    return (text || "").trim().split(/\s+/).filter(Boolean).length;
  }

  function sentenceSplit(text) {
    return (text || "").split(/(?<=[.!?])\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /* ---------- (a) local $0 tools ---------- */

  // Expand a short prompt into a fuller scene/idea sketch with guided questions.
  function expandPrompt(text) {
    var t = (text || "").trim();
    if (!t) return { error: "Give the coach a line or two to expand — a character, a place, or a moment." };
    var sents = sentenceSplit(t);
    var lines = [];
    lines.push("EXPANDED SKETCH");
    lines.push("");
    lines.push("Your spark: " + t);
    lines.push("");
    lines.push("1) WORLD — Where exactly are we? Name the block, the room, the light.");
    lines.push("   Starter: " + t.split(" ").slice(0, 8).join(" ") + "… — now plant it somewhere the audience can smell.");
    lines.push("2) WANT — Who wants what in this moment? State it in one line of action.");
    lines.push("3) OBSTACLE — What stands between them and it? Make it a person or a price, not bad luck.");
    lines.push("4) COST — If they win here, what do they lose? (FredRock rule: no clean wins.)");
    lines.push("5) IMAGE — One shot the camera holds: ");
    lines.push("");
    if (sents.length > 1) {
      lines.push("Beat seeds pulled from your lines:");
      sents.forEach(function (s, i) { lines.push("  · Beat " + (i + 1) + ": " + s); });
    }
    lines.push("");
    lines.push("Next: run this through the Beat Sheet tool to place it in the teaser or an act.");
    return { output: lines.join("\n") };
  }

  // Generate a beat sheet for an episode idea using the Snowfall template structure.
  function beatSheet(episodeIdea) {
    var idea = (episodeIdea || "").trim();
    if (!idea) return { error: "Describe the episode idea first — even one line is enough." };
    if (typeof window.SNOWFALL === "undefined") {
      return { error: "Snowfall template failed to load (js/snowfall-template.js). Check the script tag order." };
    }
    var lines = ["BEAT SHEET — " + idea, ""];
    window.SNOWFALL.episodeStructure.forEach(function (act) {
      lines.push(act.label.toUpperCase());
      lines.push("Purpose: " + act.purpose);
      act.beats.forEach(function (b, i) {
        lines.push("  " + (i + 1) + ". " + b);
      });
      lines.push("");
    });
    lines.push("THEME CHECK — answer for THIS episode: " + (window.SNOWFALL.seriesBible.fields.find(function (f) { return f.key === "theme_question"; }) || {}).defaultValue);
    lines.push("MORAL RULE — " + (window.SNOWFALL.seriesBible.fields.find(function (f) { return f.key === "moral_rule"; }) || {}).defaultValue);
    return { output: lines.join("\n") };
  }

  // Dialogue polish: a checklist run over the supplied text, with targeted observations.
  function dialoguePolish(text) {
    var t = (text || "").trim();
    if (!t) return { error: "Paste the dialogue or scene you want polished." };
    var issues = [];
    var sents = sentenceSplit(t);
    var words = wordCount(t);

    sents.forEach(function (s) {
      if (/^["']?i feel\b/i.test(s) || /\bi feel\b/i.test(s)) issues.push('On-the-nose feeling line: "' + truncate(s, 60) + '" — let action show it instead.');
      if (/\b(um|uh|like|you know)\b/i.test(s)) issues.push('Filler words in: "' + truncate(s, 60) + '" — keep them ONLY if the character stumbles.');
      if (/^(so|well|okay|ok),/i.test(s)) issues.push('Speech-starter habit: "' + truncate(s, 60) + '" — cut the throat-clearing.');
      if (/!{2,}|\?{2,}/.test(s)) issues.push('Double punctuation in: "' + truncate(s, 60) + '" — trust the actor.');
      if (s.length > 180) issues.push('Long line (' + s.split(" ").length + ' words): "' + truncate(s, 60) + '" — break it or give half to subtext.');
    });
    var lines = sentenceSplit(t).length;
    var avg = lines ? Math.round(words / lines) : 0;

    var out = ["DIALOGUE POLISH — checklist + observations", ""];
    out.push("Stats: " + words + " words, " + lines + " sentences, avg " + avg + " words/line.");
    out.push("");
    out.push("CHECKLIST (the craft, every time):");
    out.push("  [ ] Subtext — does each line want something it doesn't say outright?");
    out.push("  [ ] Voice — could you name the speaker with the names hidden?");
    out.push("  [ ] Conflict — does the line advance a clash, or just pass information?");
    out.push("  [ ] Economy — cut 10% of the words; read it again; is anything lost?");
    out.push("  [ ] Action — is there one playable verb per beat?");
    out.push("  [ ] Parentheticals — fewer than 1 per 3 lines. Used only when the actor can't tell.");
    out.push("");
    if (issues.length) {
      out.push("OBSERVATIONS ON YOUR TEXT (" + issues.length + "):");
      issues.forEach(function (is) { out.push("  · " + is); });
    } else {
      out.push("OBSERVATIONS: no surface patterns flagged. Read it aloud — the ear catches what the eye forgives.");
    }
    return { output: out.join("\n") };
  }

  // Character want-vs-need worksheet: guided fields seeded from the name given.
  function characterSheet(name) {
    var n = (name || "").trim();
    if (!n) return { error: "Give the character a name first." };
    var fields = (window.SNOWFALL && window.SNOWFALL.characterSheet.fields) || [];
    var out = ["CHARACTER SHEET — " + n, ""];
    out.push("Fill each honestly. The drama lives in the gap between want and need.");
    out.push("");
    fields.forEach(function (f) {
      if (f.key === "name") return;
      out.push(f.label.toUpperCase() + " — " + (f.hint || ""));
      out.push("  " + promptFor(f.key, n));
      out.push("");
    });
    return { output: out.join("\n") };
  }

  function promptFor(key, name) {
    var map = {
      thread: "Which thread does " + name + " carry — street/heart (A), power/institution (B), or supply/family (C)?",
      want: "What does " + name + " SAY they want? (The conscious, speakable goal.)",
      need: "What does " + name + " NEED but avoid? (The thing the story will force.)",
      flaw: "What crack in " + name + " will the pressure widen?",
      first_image: "The first shot of " + name + " the audience ever sees:",
      cost: "If " + name + " wins everything — what did it cost?"
    };
    return map[key] || "";
  }

  function truncate(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  /* ---------- (b) Connect AI (pluggable, honest) ---------- */

  function getAiConfig() {
    var get = function (k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
    return {
      endpoint: get("fr_ai_endpoint").trim(),
      model: get("fr_ai_model").trim(),
      key: get("fr_ai_key")
    };
  }

  function aiStatus() {
    var c = getAiConfig();
    if (!c.endpoint || !c.key) {
      return {
        configured: false,
        message: "Connect AI is not set up. The local $0 coach tools below work now; " +
                 "an admin can wire an OpenAI-compatible endpoint under admin → AI / Settings."
      };
    }
    return { configured: true, message: "Connect AI is configured (" + (c.model || "model unset") + ")." };
  }

  // OpenAI-compatible chat completions call. Honest error when absent/unreachable.
  async function callAiEndpoint(messages) {
    var c = getAiConfig();
    if (!c.endpoint || !c.key) {
      return { error: "AI is not connected. An admin can add an OpenAI-compatible endpoint + key under admin → AI / Settings (stored in this browser's localStorage only)." };
    }
    var url = c.endpoint.replace(/\/$/, "") + "/chat/completions";
    try {
      var resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.key },
        body: JSON.stringify({
          model: c.model || "gpt-4o-mini",
          messages: messages,
          temperature: 0.7
        })
      });
      if (!resp.ok) {
        var body = "";
        try { body = await resp.text(); } catch (e) {}
        return { error: "AI endpoint returned HTTP " + resp.status + ". " + truncate(body, 200) };
      }
      var data = await resp.json();
      var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) return { error: "AI endpoint returned an unexpected response shape. Check the endpoint is OpenAI-compatible." };
      return { output: content };
    } catch (e) {
      return { error: "Could not reach the AI endpoint (" + (e && e.message ? e.message : "network error") + "). Check the URL in admin → AI / Settings." };
    }
  }

  /* ---------- completeness check: does an answer fully address its question? ---------- */

  // Facet patterns: the kinds of detail a good origin answer carries.
  var FACETS = [
    { key: "when",     label: "WHEN it happened",      re: /\b(19\d\d|20\d\d|january|february|march|april|may|june|july|august|september|october|november|december|when i was \d+|age \d+|summer|winter|fall|spring|'?\d\ds)\b/i,
      ask: "When exactly did this happen? Give the year, the season, or how old you were." },
    { key: "where",    label: "WHERE it happened",     re: /\b(frederick|street|avenue|road|block|neighborhood|house|apartment|school|club|corner|downtown|maryland)\b/i,
      ask: "Where exactly? Name the street, the building, the room — plant us there." },
    { key: "who",      label: "WHO was there",         re: /\b(my |mom|dad|mother|father|brother|sister|uncle|aunt|cousin|friend|homeboy|homegirl|neighbor|teacher|coach|boss|girl|boy|man|woman|dude|cat|crew|family|parents|grandma|grandpa|nana)\b/i,
      ask: "Who was there with you? Name names — the people make the story real." },
    { key: "why",      label: "WHY it mattered",       re: /\b(because|so that|in order to|that's why|reason|meant|mattered|changed|never forgot|stuck with me)\b/i,
      ask: "Why does this moment still matter to you? What did it change?" },
    { key: "feeling",  label: "HOW IT FELT",           re: /\b(felt|scared|happy|angry|proud|nervous|excited|lonely|safe|love|loved|hate|cried|laughed|shook|heart|numb|free|trapped|hope)\b/i,
      ask: "How did it feel in your body? Don't summarize the feeling — show it." },
    { key: "sensory",  label: "SENSE DETAIL",          re: /\b(smell|smelled|sounded|looked|tasted|saw|heard|wore|dressed|music|song|playing|car|colors|lights|dark|cold|hot)\b/i,
      ask: "What did you see, hear, or smell? One concrete sense detail anchors the whole memory." }
  ];

  // Per-question targeted follow-ups: specific to the Round-1 question being answered.
  function targetedFollowUps(question, answerText) {
    var q = ((question && question.prompt_text) || "").toLowerCase();
    var out = [];
    function pushIf(match, qs) { if (match.test(q)) qs.forEach(function (s) { out.push(s); }); }
    pushIf(/frederick|brought you|came to/, [
      "What year did you arrive, and what was Frederick like then compared to now?",
      "Who came with you — or did you come alone?",
      "What was the very first thing you noticed when you got here?"
    ]);
    pushIf(/grow up|household|childhood/, [
      "Who lived under your roof, and who ran the house?",
      "What did money look like in your house — tight, comfortable, or unpredictable?",
      "What is one house rule or family habit that shaped you?"
    ]);
    pushIf(/meet black lansky|first time you met/, [
      "Where were you, exactly, the first time you saw him?",
      "What was he doing — and what did you think of him in that first minute?",
      "What is one moment with him that still stands out, and why that one?"
    ]);
    pushIf(/dreams growing up|career/, [
      "What job did you tell people you wanted — and what did you secretly want?",
      "Who did you look up to, and what did you want to copy about them?",
      "When did that dream change, and what changed it?"
    ]);
    pushIf(/wear|late '80s|early '90s|fashion/, [
      "Name the brands and the exact pieces — the jacket, the shoes, the fit.",
      "Where did you get them — the mall, the corner store, hand-me-downs?",
      "What did the outfit say about who you were trying to be?"
    ]);
    pushIf(/favorite places|places to go/, [
      "Name the place — and what did it look like when you walked in?",
      "Who did you go with, and what did you do there?",
      "What could you get away with there that you couldn't anywhere else?"
    ]);
    // Trim to the strongest 3 and drop ones already clearly answered.
    var a = (answerText || "").toLowerCase();
    return out.filter(function (s) {
      var keys = s.toLowerCase().replace(/[^a-z ]/g, "").split(" ").filter(function (w) { return w.length > 4; });
      return !keys.some(function (k) { return a.indexOf(k) >= 0; });
    }).slice(0, 3);
  }

  // checkAnswer(question, answerText): local completeness analysis + specific follow-ups.
  function checkAnswer(question, answerText) {
    var t = (answerText || "").trim();
    var q = question || {};
    if (!t) return { error: "Write or record an answer first — then the coach can check it." };
    var w = wordCount(t);
    var lines = ["ANSWER CHECK — " + (q.prompt_text || "your answer"), ""];
    lines.push("Length: " + w + " words. " +
      (w < 30 ? "This is a start, not the story yet — aim for at least 75 words." :
       w < 75 ? "Getting there. Push toward 150+ words for a scene the series can actually use." :
       w < 150 ? "Solid foundation. One more layer of specifics will make it camera-ready." :
       "Good length — now check the coverage below."));
    lines.push("");
    lines.push("COVERAGE — the facets a full answer carries:");
    var missing = [];
    FACETS.forEach(function (f) {
      var hit = f.re.test(t);
      lines.push("  [" + (hit ? "✓" : " ") + "] " + f.label + (hit ? "" : " — MISSING"));
      if (!hit) missing.push(f);
    });
    lines.push("");
    if (missing.length) {
      lines.push("TO DRAW OUT MORE — answer these next:");
      missing.slice(0, 3).forEach(function (f, i) { lines.push("  " + (i + 1) + ". " + f.ask); });
      lines.push("");
    }
    var targeted = targetedFollowUps(q, t);
    if (targeted.length) {
      lines.push("QUESTIONS JUST FOR THIS PROMPT:");
      targeted.forEach(function (s, i) { lines.push("  " + (i + 1) + ". " + s); });
      lines.push("");
    }
    if (!missing.length && !targeted.length) {
      lines.push("This answer covers the ground. Read it aloud — if it sounds like YOU, it's done. " +
        "If it sounds like a summary, add one scene with dialogue.");
    } else {
      lines.push("Rule of thumb for FredRock: one named place, one named person, one sense detail, " +
        "one feeling shown through action. Hit all four and the series bible can use it.");
    }
    return { output: lines.join("\n") };
  }

  window.Coach = {
    expandPrompt: expandPrompt,
    beatSheet: beatSheet,
    dialoguePolish: dialoguePolish,
    characterSheet: characterSheet,
    checkAnswer: checkAnswer,
    callAiEndpoint: callAiEndpoint,
    aiStatus: aiStatus,
    getAiConfig: getAiConfig,
    wordCount: wordCount
  };
})();
