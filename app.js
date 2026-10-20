/* ---------------------------------------------------------------------------
   4-7-8 breathing — controller
   Plain vanilla JS, no dependencies.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  /* --- Settings (stored locally) --- */
  var STORAGE_KEY = "breathe478.settings";
  var defaults = {
    lang: "en",          // en | de (English is the default; German switchable)
    theme: "system",     // system | light | dark
    sound: false,        // off by default
    soundInhale: "ocean", // inhale sound variant (see audio.js)
    soundExhale: "ocean", // exhale sound variant
    soundEnd: "gong",     // session-end sound variant (auto-stop)
    colorAnimation: true,
    holdStyle: "dot",    // hold indicator: dot (growing center dot) | ring (rim timer) | pulse (gentle breathing)
    phaseText: false,
    cycleCounter: true,
    // optional full exhale before the first round, as Dr. Weil describes it. Off by
    // default: unannounced, a session starting blue with an exhale sound reads as a
    // glitch. (Renamed from "exhaleFirst", which browsers had stored as true without
    // anyone choosing it, so that old value is ignored.)
    leadInExhale: false,
    autoStopCycles: 4    // 0 = unlimited; 4 is Dr. Weil's limit for the first month
  };
  // must match the <select id="setAutoStop"> options in index.html (8 is the
  // recommended maximum, so larger values are no longer offered)
  var AUTO_STOP_OPTIONS = [0, 2, 4, 8];
  var settings = loadSettings();

  /* --- Translations (German/English) --- */
  var I18N = {
    de: {
      settings_title: "Einstellungen",
      group_general: "Allgemein", group_sound: "Ton", group_display: "Anzeige", group_session: "Sitzung",
      language: "Sprache", design: "Design",
      opt_system: "System", opt_light: "Hell", opt_dark: "Dunkel",
      sound: "Ton", soundPage: "Klänge anpassen …", color: "Farbwechsel",
      holdStyle_label: "Halten-Anzeige", opt_dot: "Punkt", opt_ring: "Ring", opt_pulse: "Pulsieren",
      phaseText: "Phasen-Text",
      counter: "Zyklus-Zähler", exhaleFirst: "Zuerst ausatmen", autostop: "Auto-Stopp",
      opt_unlimited: "Unbegrenzt", round: "Runde", rounds: "Runden",
      phase_inhale: "Einatmen", phase_hold: "Halten", phase_exhale: "Ausatmen",
      aria_start: "Atmung starten", aria_stop: "Atmung beenden", aria_settings: "Einstellungen",
      about: "Die 478 Technik", aboutProject: "Über", imprint: "Impressum", privacy: "Datenschutz",
      roundLabel: function (n) { return n + ". Runde"; },
      roundOfLabel: function (n, total) { return n + ". von " + total + " Runden"; }
    },
    en: {
      settings_title: "Settings",
      group_general: "General", group_sound: "Sound", group_display: "Display", group_session: "Session",
      language: "Language", design: "Theme",
      opt_system: "System", opt_light: "Light", opt_dark: "Dark",
      sound: "Sound", soundPage: "Adjust sounds …", color: "Color change",
      holdStyle_label: "Hold display", opt_dot: "Dot", opt_ring: "Ring", opt_pulse: "Pulse",
      phaseText: "Phase label",
      counter: "Cycle counter", exhaleFirst: "Exhale first", autostop: "Auto-stop",
      opt_unlimited: "Unlimited", round: "round", rounds: "rounds",
      phase_inhale: "Inhale", phase_hold: "Hold", phase_exhale: "Exhale",
      aria_start: "Start breathing", aria_stop: "Stop breathing", aria_settings: "Settings",
      about: "The 478 technique", aboutProject: "About", imprint: "Imprint", privacy: "Privacy",
      roundLabel: function (n) { return "Round " + n; },
      roundOfLabel: function (n, total) { return "Round " + n + " of " + total; }
    }
  };
  function T() { return I18N[settings.lang] || I18N.en; }

  function loadSettings() {
    var s = {};
    for (var k in defaults) s[k] = defaults[k];
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        for (var key in defaults) {
          if (parsed[key] !== undefined) s[key] = parsed[key];
        }
      }
    } catch (e) { /* localStorage unavailable – use defaults */ }
    // a stored value the menu no longer offers (e.g. the former 12 rounds)
    // is clamped instead of leaving the select blank
    var n = parseInt(s.autoStopCycles, 10) || 0;
    if (AUTO_STOP_OPTIONS.indexOf(n) === -1) n = n > 8 ? 8 : defaults.autoStopCycles;
    s.autoStopCycles = n;
    return s;
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
    catch (e) { /* ignore */ }
  }

  /* --- Phases of the 4-7-8 breath (labels come from I18N) --- */
  var PHASES = [
    { name: "inhale", duration: 4000 },
    { name: "hold",   duration: 7000 },
    { name: "exhale", duration: 8000 }
  ];
  // Optional lead-in: empty the lungs once before the first inhale. Not part of
  // a round, so it is not counted; the circle stays small and turns blue.
  var LEAD_IN = { name: "exhale", duration: 4000, lead: true };

  var MIN_SCALE = 0.35;
  var REDUCED_MIN_SCALE = 0.8; // much smaller travel for "prefers-reduced-motion"
  var MAX_SCALE = 1.0;
  var RING_CIRCUMFERENCE = 2 * Math.PI * 77.5; // ring on the rim, r = 77.5 in the SVG
  var PULSE_CYCLES = 3; // gentle "breaths" during the hold in pulse mode
  var PULSE_AMOUNT = 0.12;
  var REDUCED_PULSE_AMOUNT = 0.03;

  /* Respect the system's reduced-motion setting: the CSS only tames the
     transitions, the circle animation itself is driven from here. */
  var reduceMotion = false;
  if (window.matchMedia) {
    var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion = motionQuery.matches;
    motionQuery.addEventListener("change", function (e) { reduceMotion = e.matches; });
  }
  function minScale() { return reduceMotion ? REDUCED_MIN_SCALE : MIN_SCALE; }
  function pulseAmount() { return reduceMotion ? REDUCED_PULSE_AMOUNT : PULSE_AMOUNT; }

  /* --- DOM --- */
  var stage = document.getElementById("stage");
  var breathBtn = document.getElementById("breathBtn");
  var fill = document.getElementById("fill");
  var ring = document.getElementById("ring");
  var holdDot = document.getElementById("holdDot");
  var phaseTextEl = document.getElementById("phaseText");
  var counterEl = document.getElementById("counter");
  var settingsToggle = document.getElementById("settingsToggle");
  var settingsPanel = document.getElementById("settingsPanel");

  /* --- Runtime state --- */
  var running = false;
  var leadIn = false; // true while the lead-in exhale runs
  var phaseIndex = 0;
  var phaseStart = 0;
  var cycles = 0;
  var rafId = null;
  var colors = {}; // read from CSS

  /* ======================= Colors ======================= */
  function refreshColors() {
    var cs = getComputedStyle(document.documentElement);
    colors.inhale    = cs.getPropertyValue("--c-inhale").trim();
    colors.holdStart = cs.getPropertyValue("--c-hold-start").trim();
    colors.holdEnd   = cs.getPropertyValue("--c-hold-end").trim();
    colors.exhale    = cs.getPropertyValue("--c-exhale").trim();
    colors.idle      = cs.getPropertyValue("--c-idle").trim();
    colors.accent    = cs.getPropertyValue("--accent").trim();
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /* ======================= Audio ======================= */
  // Synthesis lives in the shared BreathAudio module (audio.js); here we only
  // decide which variant to play per phase and gate it behind the sound toggle.
  function ensureAudio() {
    if (settings.sound && window.BreathAudio) window.BreathAudio.resume();
  }
  function playBreath(dir, durMs) {
    if (!settings.sound || !window.BreathAudio) return;
    if (dir === "in") window.BreathAudio.inhale(settings.soundInhale, durMs);
    else window.BreathAudio.exhale(settings.soundExhale, durMs);
  }
  function playGong() {
    if (!settings.sound || !window.BreathAudio) return;
    window.BreathAudio.end(settings.soundEnd);
  }

  /* --- Keep the screen awake (Wake Lock) during a session --- */
  var wakeLock = null;
  var wakeLockPending = false;
  function requestWakeLock() {
    // never stack requests: the browser releases the lock on its own when the
    // page is hidden, and the "release" event puts us back to null
    if (!("wakeLock" in navigator) || wakeLock || wakeLockPending) return;
    wakeLockPending = true;
    navigator.wakeLock.request("screen").then(function (wl) {
      wakeLockPending = false;
      wakeLock = wl;
      wl.addEventListener("release", function () { if (wakeLock === wl) wakeLock = null; });
    }).catch(function () { wakeLockPending = false; /* e.g. tab not visible – ignore */ });
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible" || !running) return;
    requestWakeLock();
    // requestAnimationFrame is paused while the page is hidden, performance.now()
    // is not. Without this the loop would catch up one phase per frame and fire a
    // burst of overlapping sounds (plus a jumping counter and an early auto-stop).
    // Instead we simply restart the phase the user came back to.
    if (performance.now() - phaseStart > currentPhase().duration) {
      phaseStart = performance.now();
      onPhaseEnter(currentPhase());
    }
  });

  /* ======================= Flow ======================= */
  function start() {
    if (running) return;
    running = true;
    cycles = 0;
    leadIn = settings.leadInExhale;
    phaseIndex = 0;
    phaseStart = performance.now();
    ensureAudio();
    requestWakeLock();
    breathBtn.classList.remove("smooth");
    stage.classList.add("running");
    breathBtn.setAttribute("aria-label", T().aria_stop);
    updateCounter();
    onPhaseEnter(currentPhase());
    rafId = requestAnimationFrame(loop);
  }

  function stop(auto) {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    releaseWakeLock();
    stage.classList.remove("running");
    breathBtn.setAttribute("aria-label", T().aria_start);
    // silence any breath sound still playing; on auto-stop the end sound follows
    if (window.BreathAudio) window.BreathAudio.cancel();
    if (auto) playGong();
    // gently glide back to the idle state
    breathBtn.classList.add("smooth");
    fill.style.transform = "scale(" + minScale() + ")";
    fill.style.fill = colors.idle;
    fill.style.opacity = "1"; // reset any pulse dimming
    ring.style.opacity = "0";
    holdDot.style.opacity = "0";
    phaseTextEl.textContent = "";
  }

  function toggle() {
    if (running) stop(false); else start();
  }

  function currentPhase() {
    return leadIn ? LEAD_IN : PHASES[phaseIndex];
  }

  function onPhaseEnter(phase) {
    // sound per phase
    if (phase.name === "inhale") playBreath("in", phase.duration);
    else if (phase.name === "exhale") playBreath("out", phase.duration);
    // hold stays silent
    if (settings.phaseText) phaseTextEl.textContent = phaseLabel(phase.name);
  }

  function phaseLabel(name) {
    var t = T();
    return name === "inhale" ? t.phase_inhale : name === "hold" ? t.phase_hold : t.phase_exhale;
  }

  function loop(now) {
    if (!running) return;
    var phase = currentPhase();
    var elapsed = now - phaseStart;

    if (elapsed >= phase.duration) {
      phaseStart += phase.duration;
      if (leadIn) {
        leadIn = false; // lead-in done, round 1 starts with its inhale
      } else if (++phaseIndex >= PHASES.length) {
        phaseIndex = 0;
        cycles++;
        // check auto-stop first so the next round doesn't briefly flash at the end
        if (settings.autoStopCycles > 0 && cycles >= settings.autoStopCycles) {
          stop(true);
          return;
        }
        updateCounter();
      }
      phase = currentPhase();
      onPhaseEnter(phase);
      elapsed = now - phaseStart;
    }

    var t = Math.min(elapsed / phase.duration, 1);
    render(phase, t);
    rafId = requestAnimationFrame(loop);
  }

  function render(phase, t) {
    var name = phase.name;
    var scale, fillColor, fillOpacity = 1;
    var useColor = settings.colorAnimation;
    var low = minScale();

    if (phase.lead) {
      // lead-in exhale: the circle is already empty, only the color announces it
      scale = low;
      fillColor = useColor ? colors.exhale : colors.accent;
      ring.style.opacity = "0";
      holdDot.style.opacity = "0";
    } else if (name === "inhale") {
      scale = low + (MAX_SCALE - low) * easeInOut(t);
      fillColor = useColor ? colors.inhale : colors.accent;
      ring.style.opacity = "0";
      holdDot.style.opacity = "0";
    } else if (name === "hold") {
      scale = MAX_SCALE;
      fillColor = useColor ? colors.holdStart : colors.accent;
      var progressColor = useColor ? colors.holdEnd : colors.accent;
      if (settings.holdStyle === "ring") {
        // yellow fill, inner sweeping timer ring in orange (two colors, same family)
        holdDot.style.opacity = "0";
        ring.style.opacity = "1";
        ring.style.stroke = progressColor;
        ring.style.strokeDashoffset = (RING_CIRCUMFERENCE * (1 - t)).toFixed(2);
      } else if (settings.holdStyle === "pulse") {
        // "breathing" pulse — the circle clearly pulses in size (mood cue, not a timer)
        ring.style.opacity = "0";
        holdDot.style.opacity = "0";
        var wave = 0.5 - 0.5 * Math.cos(t * PULSE_CYCLES * 2 * Math.PI); // 0..1..0, repeats
        scale = MAX_SCALE - pulseAmount() * wave; // full -> ~0.88 and back, calm but visible
        fillOpacity = 1 - 0.1 * wave;             // a touch of glow along with the size
      } else {
        // default: orange dot growing from the center until it fills the circle (linear = steady)
        ring.style.opacity = "0";
        holdDot.style.opacity = "1";
        holdDot.style.fill = progressColor;
        holdDot.style.transform = "scale(" + t.toFixed(4) + ")";
      }
    } else { // exhale
      scale = MAX_SCALE - (MAX_SCALE - low) * easeInOut(t);
      fillColor = useColor ? colors.exhale : colors.accent;
      ring.style.opacity = "0";
      holdDot.style.opacity = "0";
    }

    fill.style.transform = "scale(" + scale.toFixed(4) + ")";
    fill.style.fill = fillColor;
    fill.style.opacity = fillOpacity.toFixed(3);
  }

  function updateCounter() {
    // "1. Runde" / "Round 1" — or "1. von 2 Runden" / "Round 1 of 2" when auto-stop is set
    var t = T();
    counterEl.textContent = settings.autoStopCycles > 0
      ? t.roundOfLabel(cycles + 1, settings.autoStopCycles)
      : t.roundLabel(cycles + 1);
  }

  /* ======================= Language ======================= */
  function applyLang() {
    var t = T();
    document.documentElement.lang = settings.lang;
    // all static texts marked with data-i18n
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-i18n");
      if (t[key] != null) nodes[i].textContent = t[key];
    }
    // auto-stop options (with a number)
    var as = document.getElementById("setAutoStop");
    for (var j = 0; j < as.options.length; j++) {
      var v = parseInt(as.options[j].value, 10);
      as.options[j].textContent = v === 0 ? t.opt_unlimited : (v + " " + (v === 1 ? t.round : t.rounds));
    }
    // aria labels
    settingsToggle.setAttribute("aria-label", t.aria_settings);
    settingsPanel.setAttribute("aria-label", t.settings_title);
    breathBtn.setAttribute("aria-label", running ? t.aria_stop : t.aria_start);
    // tab title and description (the markup ships English, page.js set them once)
    var title = document.body.getAttribute("data-title-" + settings.lang);
    if (title) document.title = title;
    var desc = document.body.getAttribute("data-desc-" + settings.lang);
    var metaDesc = document.querySelector('meta[name="description"]');
    if (desc && metaDesc) metaDesc.setAttribute("content", desc);
    // refresh the live display
    if (running && settings.phaseText) phaseTextEl.textContent = phaseLabel(currentPhase().name);
    if (running) updateCounter();
  }

  /* ======================= Theme ======================= */
  function applyTheme() {
    var root = document.documentElement;
    if (settings.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", settings.theme);
    // keep the browser UI color with a forced theme (page.js owns that meta tag)
    if (window.BreathPage) window.BreathPage.applyThemeColor(settings.theme);
    refreshColors();
    if (!running) fill.style.fill = colors.idle;
  }

  /* ======================= Wire up the UI ======================= */
  function applyDisplayToggles() {
    stage.classList.toggle("show-phase", settings.phaseText);
    stage.classList.toggle("show-counter", settings.cycleCounter);
  }

  function syncControls() {
    document.getElementById("setLang").value = settings.lang;
    document.getElementById("setTheme").value = settings.theme;
    document.getElementById("setSound").checked = settings.sound;
    document.getElementById("setColor").checked = settings.colorAnimation;
    document.getElementById("setHoldStyle").value = settings.holdStyle;
    document.getElementById("setPhaseText").checked = settings.phaseText;
    document.getElementById("setCounter").checked = settings.cycleCounter;
    document.getElementById("setExhaleFirst").checked = settings.leadInExhale;
    document.getElementById("setAutoStop").value = String(settings.autoStopCycles);
  }

  function wireControls() {
    document.getElementById("setLang").addEventListener("change", function (e) {
      settings.lang = e.target.value; saveSettings(); applyLang();
    });
    document.getElementById("setTheme").addEventListener("change", function (e) {
      settings.theme = e.target.value; saveSettings(); applyTheme();
    });
    document.getElementById("setSound").addEventListener("change", function (e) {
      settings.sound = e.target.checked; saveSettings(); if (settings.sound) ensureAudio();
    });
    document.getElementById("setColor").addEventListener("change", function (e) {
      settings.colorAnimation = e.target.checked; saveSettings();
    });
    document.getElementById("setHoldStyle").addEventListener("change", function (e) {
      settings.holdStyle = e.target.value; saveSettings();
    });
    document.getElementById("setPhaseText").addEventListener("change", function (e) {
      settings.phaseText = e.target.checked; saveSettings(); applyDisplayToggles();
      if (!settings.phaseText) phaseTextEl.textContent = "";
    });
    document.getElementById("setCounter").addEventListener("change", function (e) {
      settings.cycleCounter = e.target.checked; saveSettings(); applyDisplayToggles();
    });
    document.getElementById("setExhaleFirst").addEventListener("change", function (e) {
      settings.leadInExhale = e.target.checked; saveSettings();
    });
    document.getElementById("setAutoStop").addEventListener("change", function (e) {
      settings.autoStopCycles = parseInt(e.target.value, 10) || 0; saveSettings();
      if (running) updateCounter(); // "Round 2 of 4" should follow right away
    });
  }

  function openPanel(open) {
    settingsPanel.hidden = !open;
    settingsToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  /* Circle: start/stop */
  breathBtn.addEventListener("click", toggle);
  breathBtn.addEventListener("keydown", function (e) {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
  });

  /* Gear + panel */
  settingsToggle.addEventListener("click", function () {
    openPanel(settingsPanel.hidden);
  });
  document.addEventListener("click", function (e) {
    if (settingsPanel.hidden) return;
    if (!settingsPanel.contains(e.target) && !settingsToggle.contains(e.target)) openPanel(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || settingsPanel.hidden) return;
    // hand the focus back to the gear, otherwise it would stay on a now hidden control
    var focusInside = settingsPanel.contains(document.activeElement);
    openPanel(false);
    if (focusInside) settingsToggle.focus();
  });

  /* React to system theme changes (only in system mode) */
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (settings.theme === "system") applyTheme();
    });
  }

  /* Offline support: the service worker caches the (tiny) site so it also works
     without a connection. Registered from here only – its scope covers all pages. */
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* optional extra */ });
    });
  }

  /* --- Init --- */
  applyLang();
  applyTheme();
  syncControls();
  applyDisplayToggles();
  wireControls();
  fill.style.transform = "scale(" + minScale() + ")";
})();
