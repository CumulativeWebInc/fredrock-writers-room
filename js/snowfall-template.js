/* FredRock Writers Room — snowfall-template.js
 * The Snowfall-style series/script template DATA + renderer (ARCHITECTURE §5).
 * Based on research 2026-09-29: Snowfall (FX, 2017-2023) — creators John Singleton,
 * Eric Amadio, Dave Andron. Subject: early-80s crack epidemic, Los Angeles.
 * Engine: 3-4 intersecting POV threads, each with valid-but-narrow ambitions,
 * colliding over one trade.
 *
 * Consumed by: Script Studio (js/writer.js) and the coach beat-sheet tool (js/coach.js).
 * This is a STRUCTURAL template (premise/engine/POV/acts), not Snowfall's story content.
 */
(function () {
  "use strict";

  var SNOWFALL = {
    meta: {
      name: "The FredRock Format",
      lineage: "Snowfall-style (Singleton / Amadio / Andron, FX 2017-2023)",
      note: "A structural template: premise, engine, POV threads, five acts. " +
            "Your story's content is your own — the shape is borrowed from proven craft."
    },

    seriesBible: {
      fields: [
        { key: "premise", label: "Premise", hint: "One sentence: whose story is this, and what world tests them?", placeholder: "A [who] in [where/when] wants [goal], but [obstacle] forces them to [choice]." },
        { key: "engine", label: "Engine — separate spiders, one web", hint: "What single trade, secret, or event ties every POV thread together? Everything collides over it.", placeholder: "The trade everyone is circling: …" },
        { key: "thread_a", label: "POV Thread A — street / heart", hint: "The ground-level ambition. Valid goal, narrow view.", placeholder: "Who they are, what they want, what they can't see…" },
        { key: "thread_b", label: "POV Thread B — power / institution", hint: "The system ambition. The institution that claims order.", placeholder: "Who they are, what they want, what it costs…" },
        { key: "thread_c", label: "POV Thread C — supply / family", hint: "The supplier or family ambition. What keeps it personal.", placeholder: "Who they are, what they want, what they'll protect…" },
        { key: "era_texture", label: "Era texture", hint: "Checklist — the sensory evidence of the period. Check what you've nailed on the page.", checklist: ["Music", "Fashion", "Cars", "News events", "Slang", "Neighborhoods", "Technology", "Food & drink"] },
        { key: "theme_question", label: "Theme question", hint: "The question every episode answers a little differently.", defaultValue: "Who gets out? Who gets out better? What did it cost?" },
        { key: "moral_rule", label: "Moral rule", hint: "The rule the room never breaks.", defaultValue: "No clean wins." },
        { key: "logline", label: "Episode / pilot logline", hint: "One line that sells this episode.", placeholder: "When … , a … must … or else …" }
      ]
    },

    episodeStructure: [
      {
        key: "teaser",
        label: "Teaser / Cold Open",
        purpose: "Atmospheric. Raises a question the episode must answer. May follow a different POV than the A-story.",
        beats: [
          "Open on an image that sets the world and its price",
          "Introduce the pressure of the hour — not the plot yet",
          "End on a question or a threat: what does the audience NEED to know next?"
        ]
      },
      {
        key: "act1",
        label: "Act 1 — Threads established",
        purpose: "Every POV thread is on the table with its want stated or shown. The web is visible.",
        beats: [
          "Thread A wants something — show it in action",
          "Thread B asserts order or power",
          "Thread C reveals the personal stake",
          "End of act: a door closes or an offer is made"
        ]
      },
      {
        key: "act2",
        label: "Act 2 — Complications; threads touch",
        purpose: "Each thread's plan meets resistance. Threads begin to touch — nobody is clean of the others.",
        beats: [
          "Every plan hits its first real obstacle",
          "Two threads collide in one scene (the touch)",
          "A character learns something they wish they hadn't",
          "End of act: the cost of winning becomes visible"
        ]
      },
      {
        key: "act3",
        label: "Act 3 — Midpoint turn; cost visible",
        purpose: "The story turns. What winning requires is now undeniable — and someone pays.",
        beats: [
          "A reversal: someone switches sides, lies, or loses something",
          "The moral price is shown on screen, not stated",
          "The engine (the one trade) tightens around all three threads",
          "End of act: no going back — a line is crossed"
        ]
      },
      {
        key: "act4",
        label: "Act 4 — Collisions",
        purpose: "All threads collide over the trade. Wants and needs are in direct conflict.",
        beats: [
          "Confrontations escalate — verbal first, then real",
          "Every thread pays for what they wanted in Acts 1-3",
          "The weakest link breaks, or the strongest shows their crack",
          "End of act: the deal is struck, broken, or stolen"
        ]
      },
      {
        key: "act5",
        label: "Act 5 / Tag — Fallout; question for next episode",
        purpose: "The dust settles unevenly. Someone is up, someone is ruined — and a new question opens the next episode.",
        beats: [
          "Show the fallout, beat by beat, no speeches",
          "Each thread gets a final image of what it cost",
          "Theme question answered for THIS episode",
          "Tag: plant the question the next episode must answer"
        ]
      }
    ],

    sceneFields: [
      { key: "heading", label: "Scene heading", hint: "INT./EXT. LOCATION - TIME", placeholder: "INT. FREDRICK ROWHOUSE - NIGHT" },
      { key: "action", label: "Action", hint: "What happens, seen on screen. No internal monologue.", placeholder: "Describe the action…" },
      { key: "character", label: "Character", hint: "Who speaks", placeholder: "NAME" },
      { key: "dialogue", label: "Dialogue", hint: "What they say — subtext over text.", placeholder: "…", multiline: true },
      { key: "parenthetical", label: "Parenthetical", hint: "Brief behavior, used sparingly", placeholder: "(beat)" }
    ],

    characterSheet: {
      fields: [
        { key: "name", label: "Name", placeholder: "…" },
        { key: "thread", label: "POV thread", hint: "A = street/heart, B = power/institution, C = supply/family", placeholder: "A / B / C" },
        { key: "want", label: "Want (stated)", hint: "What they say they want — the conscious goal.", placeholder: "…" },
        { key: "need", label: "Need (hidden)", hint: "What they actually need — the thing they avoid.", placeholder: "…" },
        { key: "flaw", label: "Flaw", hint: "The crack that the story will press on.", placeholder: "…" },
        { key: "first_image", label: "First image", hint: "The shot that introduces them to the audience.", placeholder: "…" },
        { key: "cost", label: "Cost", hint: "What winning would cost them — the price they refuse to name.", placeholder: "…" }
      ]
    }
  };

  /* ---------- renderer helpers (Script Studio uses these) ---------- */

  function blankScene() {
    var s = {};
    SNOWFALL.sceneFields.forEach(function (f) { s[f.key] = ""; });
    return s;
  }

  function blankAct(key) {
    return { key: key, scenes: [blankScene()], notes: "" };
  }

  function blankBible() {
    var b = {};
    SNOWFALL.seriesBible.fields.forEach(function (f) {
      b[f.key] = f.defaultValue || "";
      if (f.checklist) b[f.key + "_checked"] = [];
    });
    return b;
  }

  function blankCharacter() {
    var c = {};
    SNOWFALL.characterSheet.fields.forEach(function (f) { c[f.key] = ""; });
    return c;
  }

  // Fresh episode content_json skeleton for the scripts table.
  function blankEpisode() {
    var ep = { bible: blankBible(), acts: {}, characters: [blankCharacter()] };
    SNOWFALL.episodeStructure.forEach(function (a) { ep.acts[a.key] = blankAct(a.key); });
    return ep;
  }

  window.SNOWFALL = SNOWFALL;
  window.SnowfallForms = {
    blankScene: blankScene,
    blankAct: blankAct,
    blankBible: blankBible,
    blankCharacter: blankCharacter,
    blankEpisode: blankEpisode
  };
})();
