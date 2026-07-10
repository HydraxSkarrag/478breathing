/* ---------------------------------------------------------------------------
   4-7-8 breathing — controller
   Plain vanilla JS, no dependencies.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  /* --- Settings (stored locally) --- */
  var STORAGE_KEY = "breathe478.settings";
  var defaults = {
    lang: "de",          // de | en (German is the default)
    theme: "system",     // system | light | dark
    sound: false,        // off by default
    colorAnimation: true,
    phaseText: false,
    cycleCounter: true,
    autoStopCycles: 0    // 0 = unlimited
  };
  var settings = loadSettings();

  /* --- Translations (German/English) --- */
  var I18N = {
    de: {
      settings_title: "Einstellungen", language: "Sprache", design: "Design",
      opt_system: "System", opt_light: "Hell", opt_dark: "Dunkel",
      sound: "Ton", color: "Farbwechsel", phaseText: "Phasen-Text",
      counter: "Zyklus-Zähler", autostop: "Auto-Stopp",
      opt_unlimited: "Unbegrenzt", round: "Runde", rounds: "Runden",
      phase_inhale: "Einatmen", phase_hold: "Halten", phase_exhale: "Ausatmen",
      aria_start: "Atmung starten", aria_stop: "Atmung beenden", aria_settings: "Einstellungen",
      imprint: "Impressum", privacy: "Datenschutz",
      roundLabel: function (n) { return n + ". Runde"; }
    },
    en: {
      settings_title: "Settings", language: "Language", design: "Theme",
      opt_system: "System", opt_light: "Light", opt_dark: "Dark",
      sound: "Sound", color: "Color change", phaseText: "Phase label",
      counter: "Cycle counter", autostop: "Auto-stop",
      opt_unlimited: "Unlimited", round: "round", rounds: "rounds",
      phase_inhale: "Inhale", phase_hold: "Hold", phase_exhale: "Exhale",
      aria_start: "Start breathing", aria_stop: "Stop breathing", aria_settings: "Settings",
      imprint: "Imprint", privacy: "Privacy",
      roundLabel: function (n) { return "Round " + n; }
    }
  };
  function T() { return I18N[settings.lang] || I18N.de; }

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
    return s;
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
    catch (e) { /* ignore */ }
  }

  /* --- Phases of the 4-7-8 breath --- */
  var PHASES = [
    { name: "inhale", label: "Einatmen", duration: 4000 },
    { name: "hold",   label: "Halten",   duration: 7000 },
    { name: "exhale", label: "Ausatmen", duration: 8000 }
  ];

  var MIN_SCALE = 0.35;
  var MAX_SCALE = 1.0;
  var RING_CIRCUMFERENCE = 2 * Math.PI * 77.5; // ring on the rim, r = 77.5 in the SVG

  /* --- DOM --- */
  var stage = document.getElementById("stage");
  var breathBtn = document.getElementById("breathBtn");
  var fill = document.getElementById("fill");
  var ring = document.getElementById("ring");
  var phaseTextEl = document.getElementById("phaseText");
  var counterEl = document.getElementById("counter");
  var settingsToggle = document.getElementById("settingsToggle");
  var settingsPanel = document.getElementById("settingsPanel");

  /* --- Runtime state --- */
  var running = false;
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
  var audioCtx = null;
  var master = null;

  function ensureAudio() {
    if (!settings.sound) return;
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      master = audioCtx.createGain();
      master.gain.value = 0.9;
      master.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  // Pink-noise buffer (created once), the basis for the "ocean breath".
  var noiseBuffer = null;
  function getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    var len = Math.floor(audioCtx.sampleRate * 2);
    noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    var d = noiseBuffer.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0; // Paul Kellett approximation for pink noise
    for (var i = 0; i < len; i++) {
      var white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      d[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
    }
    return noiseBuffer;
  }

  // "Ocean breath": quiet filtered noise that swells on the inhale and ebbs
  // on the exhale – like breath/waves, without a melody.
  function playBreath(dir, durMs) {
    if (!settings.sound || !audioCtx) return;
    var dur = durMs / 1000;
    var now = audioCtx.currentTime;

    var src = audioCtx.createBufferSource();
    src.buffer = getNoiseBuffer();
    src.loop = true;

    var filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.8;

    var g = audioCtx.createGain();
    src.connect(filter).connect(g).connect(master);

    var peak = 0.11;
    g.gain.setValueAtTime(0.0001, now);

    if (dir === "in") {
      // dark -> brighter (air flowing in), volume swells
      filter.frequency.setValueAtTime(420, now);
      filter.frequency.linearRampToValueAtTime(1150, now + dur);
      g.gain.linearRampToValueAtTime(peak, now + dur * 0.3);
      g.gain.setValueAtTime(peak, now + dur * 0.92); // full volume nearly to the end (audible the whole 4 s)
      // short, gentle fade only in the final moment (hand-off to the silent hold)
      g.gain.linearRampToValueAtTime(0.0001, now + dur);
    } else {
      // brighter -> darker (air flowing out), long fade-out
      filter.frequency.setValueAtTime(1050, now);
      filter.frequency.linearRampToValueAtTime(360, now + dur);
      g.gain.linearRampToValueAtTime(peak, now + dur * 0.14);
      g.gain.linearRampToValueAtTime(0.0001, now + dur);
    }

    src.start(now);
    src.stop(now + dur + 0.05);
  }

  // Deep, soft gong rumble for the ending (auto-stop): very low fundamental
  // with overtones, slow beating (rumble), dark fade-out.
  function playGong() {
    if (!settings.sound || !audioCtx) return;
    var now = audioCtx.currentTime;
    var dur = 9;

    // shared envelope (soft attack, long exponential decay)
    var env = audioCtx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(1, now + 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    // filter darkens further as it decays
    var filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.5;
    filter.frequency.setValueAtTime(700, now);
    filter.frequency.linearRampToValueAtTime(200, now + dur);
    filter.connect(env).connect(master);

    var base = 62; // very low – a rumble you can feel on headphones
    var partials = [{ f: 1.0, g: 1.0 }, { f: 2.0, g: 0.55 }, { f: 3.0, g: 0.28 }, { f: 4.02, g: 0.12 }];
    partials.forEach(function (p) {
      // two slightly detuned voices -> slow beating = soft rumble
      [0, 1.5].forEach(function (detune) {
        var osc = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = base * p.f + detune;
        g.gain.value = 0.045 * p.g;
        osc.connect(g).connect(filter);
        osc.start(now);
        osc.stop(now + dur + 0.1);
      });
    });
  }

  /* --- Keep the screen awake (Wake Lock) during a session --- */
  var wakeLock = null;
  function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    navigator.wakeLock.request("screen").then(function (wl) {
      wakeLock = wl;
    }).catch(function () { /* e.g. tab not visible – ignore */ });
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && running) requestWakeLock();
  });

  /* ======================= Flow ======================= */
  function start() {
    if (running) return;
    running = true;
    cycles = 0;
    phaseIndex = 0;
    phaseStart = performance.now();
    ensureAudio();
    requestWakeLock();
    breathBtn.classList.remove("smooth");
    stage.classList.add("running");
    breathBtn.setAttribute("aria-label", T().aria_stop);
    updateCounter();
    onPhaseEnter(0);
    rafId = requestAnimationFrame(loop);
  }

  function stop(auto) {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    releaseWakeLock();
    stage.classList.remove("running");
    breathBtn.setAttribute("aria-label", T().aria_start);
    if (auto) playGong();
    // gently glide back to the idle state
    breathBtn.classList.add("smooth");
    fill.style.transform = "scale(" + MIN_SCALE + ")";
    fill.style.fill = colors.idle;
    ring.style.opacity = "0";
    phaseTextEl.textContent = "";
  }

  function toggle() {
    if (running) stop(false); else start();
  }

  function onPhaseEnter(idx) {
    var phase = PHASES[idx];
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
    var phase = PHASES[phaseIndex];
    var elapsed = now - phaseStart;

    if (elapsed >= phase.duration) {
      phaseStart += phase.duration;
      phaseIndex++;
      if (phaseIndex >= PHASES.length) {
        phaseIndex = 0;
        cycles++;
        // check auto-stop first so the next round doesn't briefly flash at the end
        if (settings.autoStopCycles > 0 && cycles >= settings.autoStopCycles) {
          stop(true);
          return;
        }
        updateCounter();
      }
      onPhaseEnter(phaseIndex);
      phase = PHASES[phaseIndex];
      elapsed = now - phaseStart;
    }

    var t = Math.min(elapsed / phase.duration, 1);
    render(phase.name, t);
    rafId = requestAnimationFrame(loop);
  }

  function render(name, t) {
    var scale, fillColor;
    var useColor = settings.colorAnimation;

    if (name === "inhale") {
      scale = MIN_SCALE + (MAX_SCALE - MIN_SCALE) * easeInOut(t);
      fillColor = useColor ? colors.inhale : colors.accent;
      ring.style.opacity = "0";
    } else if (name === "hold") {
      scale = MAX_SCALE;
      // yellow fill, inner sweeping timer ring in orange (two colors, same family)
      fillColor = useColor ? colors.holdStart : colors.accent;
      ring.style.opacity = "1";
      ring.style.stroke = useColor ? colors.holdEnd : colors.accent;
      ring.style.strokeDashoffset = (RING_CIRCUMFERENCE * (1 - t)).toFixed(2);
    } else { // exhale
      scale = MAX_SCALE - (MAX_SCALE - MIN_SCALE) * easeInOut(t);
      fillColor = useColor ? colors.exhale : colors.accent;
      ring.style.opacity = "0";
    }

    fill.style.transform = "scale(" + scale.toFixed(4) + ")";
    fill.style.fill = fillColor;
  }

  function updateCounter() {
    // shows the current round from the first one: "1. Runde" / "Round 1", ...
    counterEl.textContent = T().roundLabel(cycles + 1);
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
    // refresh the live display
    if (running && settings.phaseText) phaseTextEl.textContent = phaseLabel(PHASES[phaseIndex].name);
    if (running) updateCounter();
  }

  /* ======================= Theme ======================= */
  function applyTheme() {
    var root = document.documentElement;
    if (settings.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", settings.theme);
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
    document.getElementById("setPhaseText").checked = settings.phaseText;
    document.getElementById("setCounter").checked = settings.cycleCounter;
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
    document.getElementById("setPhaseText").addEventListener("change", function (e) {
      settings.phaseText = e.target.checked; saveSettings(); applyDisplayToggles();
      if (!settings.phaseText) phaseTextEl.textContent = "";
    });
    document.getElementById("setCounter").addEventListener("change", function (e) {
      settings.cycleCounter = e.target.checked; saveSettings(); applyDisplayToggles();
    });
    document.getElementById("setAutoStop").addEventListener("change", function (e) {
      settings.autoStopCycles = parseInt(e.target.value, 10) || 0; saveSettings();
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
    if (e.key === "Escape" && !settingsPanel.hidden) openPanel(false);
  });

  /* React to system theme changes (only in system mode) */
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (settings.theme === "system") applyTheme();
    });
  }

  /* --- Init --- */
  applyLang();
  applyTheme();
  syncControls();
  applyDisplayToggles();
  wireControls();
  fill.style.transform = "scale(" + MIN_SCALE + ")";
})();
