/* ---------------------------------------------------------------------------
   4-7-8 breathing — sound settings page (sound.html)

   Builds the picker from the variant list, previews each sound through the
   shared BreathAudio module and writes the choices back into the same
   localStorage key the app uses.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var STORAGE_KEY = "breathe478.settings";

  var defaults = { sound: false, soundInhale: "ocean", soundExhale: "ocean", soundEnd: "gong" };
  var settings = {};
  for (var k in defaults) settings[k] = defaults[k];
  try {
    var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    for (var key in defaults) if (raw[key] !== undefined) settings[key] = raw[key];
  } catch (e) { /* no storage */ }

  // Merge our keys into whatever else is stored (theme, language, …).
  function save() {
    try {
      var current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      for (var key in defaults) current[key] = settings[key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) { /* ignore */ }
  }

  var de = window.BreathPage ? !window.BreathPage.isEnglish : false;

  /* --- Page level strings --- */
  var STR = {
    back:  de ? "← Zurück" : "← Back",
    title: de ? "Klänge"   : "Sounds",
    intro: de
      ? "Wähle für jede Phase einen Klang. Mit ▶ hörst du ihn probeweise an. Alle Klänge werden direkt im Browser synthetisiert, ganz ohne Audiodateien."
      : "Pick a sound for each phase. Use ▶ to preview it. All sounds are synthesized right in the browser – no audio files.",
    test:  de ? "Anhören" : "Preview",
    masterName: de ? "Ton in der Übung" : "Sound during the exercise",
    masterOn:   de ? "Ist eingeschaltet, die Klänge sind währenddessen zu hören."
                   : "Switched on, so you hear these sounds while breathing.",
    masterOff:  de ? "Ist ausgeschaltet. Die Vorschau funktioniert trotzdem."
                   : "Switched off. Previews still work here."
  };

  /* --- Section and variant configuration. `test` is how long the preview button locks. --- */
  var SECTIONS = [
    {
      key: "soundInhale", kind: "inhale", test: 4000,
      title: de ? "Einatmen (4 s)" : "Inhale (4 s)",
      variants: [
        { id: "ocean", name: de ? "Ozean" : "Ocean", desc: de ? "Tiefes, weiches Rauschen, das anschwillt." : "Deep, soft noise that swells." },
        { id: "wind",  name: de ? "Wind"  : "Wind",  desc: de ? "Heller, pfeifender Luftzug mit Böen, der ansteigt." : "A bright, whistling draft with gusts, rising." },
        { id: "rain",  name: de ? "Regen" : "Rain",  desc: de ? "Feines Prasseln, das dichter wird." : "A fine patter growing denser." },
        { id: "pad",   name: de ? "Pad"   : "Pad",   desc: de ? "Warmer Flächenklang, der sich öffnet." : "A warm pad opening up." },
        { id: "off",   name: de ? "Aus"   : "Off",   desc: de ? "Kein Klang." : "No sound." }
      ]
    },
    {
      key: "soundExhale", kind: "exhale", test: 8000,
      title: de ? "Ausatmen (8 s)" : "Exhale (8 s)",
      variants: [
        { id: "ocean", name: de ? "Ozean" : "Ocean", desc: de ? "Tiefes, weiches Rauschen, das verebbt." : "Deep, soft noise that ebbs away." },
        { id: "wind",  name: de ? "Wind"  : "Wind",  desc: de ? "Heller, pfeifender Luftzug, der absinkt und verweht." : "A bright, whistling draft that sinks and drifts away." },
        { id: "deep",  name: de ? "Tief"  : "Deep",  desc: de ? "Dunkler und dumpfer, mit tiefem Nachklang." : "Darker and duller, with a low undertone." },
        { id: "rain",  name: de ? "Regen" : "Rain",  desc: de ? "Feines Prasseln, das sich verzieht." : "A fine patter thinning out." },
        { id: "pad",   name: de ? "Pad"   : "Pad",   desc: de ? "Warmer Flächenklang, der sich senkt." : "A warm pad that settles down." },
        { id: "off",   name: de ? "Aus"   : "Off",   desc: de ? "Kein Klang." : "No sound." }
      ]
    },
    {
      key: "soundEnd", kind: "end", test: 5000,
      title: de ? "Abschluss (bei Auto-Stopp)" : "Ending (on auto-stop)",
      variants: [
        { id: "gong",      name: de ? "Gong"         : "Gong",         desc: de ? "Tiefes, weiches Wummern." : "A deep, soft rumble." },
        { id: "bowl",      name: de ? "Klangschale"  : "Singing bowl", desc: de ? "Heller, langer Nachklang." : "A brighter, ringing decay." },
        { id: "bell",      name: de ? "Tempelglocke" : "Temple bell",  desc: de ? "Ein einzelner, tiefer Schlag." : "A single, low strike." },
        { id: "harp",      name: de ? "Harfe"        : "Harp",         desc: de ? "Sanfte, absteigende Tonfolge." : "A gentle descending figure." },
        { id: "windchime", name: de ? "Windspiel"    : "Wind chimes",  desc: de ? "Zarte, zufällige Klänge." : "Delicate, random notes." },
        { id: "off",       name: de ? "Aus"          : "Off",          desc: de ? "Kein Klang." : "No sound." }
      ]
    }
  ];

  /* --- Page strings (page.js already handled <title> and the back link) --- */
  document.getElementById("pageTitle").textContent = STR.title;
  document.getElementById("pageIntro").textContent = STR.intro;

  /* --- Master switch: turn the app's sound on without going back --- */
  var master = document.getElementById("setSoundMaster");
  var masterDesc = document.getElementById("masterDesc");
  document.getElementById("masterName").textContent = STR.masterName;
  function syncMaster() {
    master.checked = !!settings.sound;
    masterDesc.textContent = settings.sound ? STR.masterOn : STR.masterOff;
  }
  syncMaster();
  master.addEventListener("change", function () {
    settings.sound = master.checked;
    save();
    syncMaster();
    if (settings.sound && window.BreathAudio) window.BreathAudio.resume();
  });

  /* --- Preview --- */
  var activeTimer = null;
  var activeButton = null;

  function releaseButton() {
    if (!activeButton) return;
    activeButton.classList.remove("playing");
    activeButton.disabled = false;
    activeButton = null;
  }

  function preview(kind, variant, durMs, button) {
    if (!window.BreathAudio) return;
    // a running preview is cut off, so two sounds never overlap
    window.BreathAudio.cancel();
    if (activeTimer) clearTimeout(activeTimer);
    releaseButton();

    window.BreathAudio.resume();
    if (kind === "inhale") window.BreathAudio.inhale(variant, durMs);
    else if (kind === "exhale") window.BreathAudio.exhale(variant, durMs);
    else window.BreathAudio.end(variant);

    activeButton = button;
    button.classList.add("playing");
    button.disabled = true;
    activeTimer = setTimeout(function () {
      activeTimer = null;
      releaseButton();
    }, durMs);
  }

  /* --- Build the picker --- */
  var container = document.getElementById("sections");

  SECTIONS.forEach(function (sec, secIndex) {
    // saved variant no longer offered (e.g. removed in an update)?
    // -> fall back to the default (first entry), matching playback behavior
    var known = sec.variants.some(function (v) { return v.id === settings[sec.key]; });
    if (!known) settings[sec.key] = sec.variants[0].id;

    var wrap = document.createElement("section");
    wrap.className = "snd-section";

    var h = document.createElement("h2");
    h.id = "sndHeading" + secIndex;
    h.textContent = sec.title;
    wrap.appendChild(h);

    // the options are one radio group, so screen readers announce them as a set
    var group = document.createElement("div");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-labelledby", h.id);
    wrap.appendChild(group);

    sec.variants.forEach(function (v) {
      var row = document.createElement("div");
      row.className = "snd-option" + (settings[sec.key] === v.id ? " selected" : "");
      row.setAttribute("data-variant", v.id);

      var pick = document.createElement("button");
      pick.type = "button";
      pick.className = "snd-pick";
      pick.setAttribute("role", "radio");
      pick.setAttribute("aria-checked", settings[sec.key] === v.id ? "true" : "false");
      pick.innerHTML =
        '<span class="snd-radio" aria-hidden="true"></span>' +
        '<span class="snd-text"><span class="snd-name"></span>' +
        '<span class="snd-desc"></span></span>';
      pick.querySelector(".snd-name").textContent = v.name;
      pick.querySelector(".snd-desc").textContent = v.desc;

      pick.addEventListener("click", function () {
        settings[sec.key] = v.id;
        save();
        var opts = group.querySelectorAll(".snd-option");
        for (var i = 0; i < opts.length; i++) {
          var on = opts[i] === row;
          opts[i].classList.toggle("selected", on);
          opts[i].querySelector(".snd-pick").setAttribute("aria-checked", on ? "true" : "false");
        }
      });

      var test = document.createElement("button");
      test.type = "button";
      test.className = "snd-test";
      test.setAttribute("aria-label", STR.test + ": " + v.name);
      test.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';
      if (v.id === "off") test.disabled = true;

      test.addEventListener("click", function () {
        if (test.disabled) return;
        preview(sec.kind, v.id, sec.test, test);
      });

      row.appendChild(pick);
      row.appendChild(test);
      group.appendChild(row);
    });

    container.appendChild(wrap);
  });
})();
