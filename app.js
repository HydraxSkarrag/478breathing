/* ---------------------------------------------------------------------------
   4-7-8 Atmung — Steuerung
   Reines Vanilla-JS, keine Abhängigkeiten.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  /* --- Einstellungen (lokal gespeichert) --- */
  var STORAGE_KEY = "breathe478.settings";
  var defaults = {
    theme: "system",     // system | light | dark
    sound: false,        // default aus
    colorAnimation: true,
    vibration: false,
    phaseText: false,
    cycleCounter: true,
    autoStopCycles: 0    // 0 = unbegrenzt
  };
  var settings = loadSettings();

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
    } catch (e) { /* localStorage nicht verfügbar – Defaults nutzen */ }
    return s;
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
    catch (e) { /* ignorieren */ }
  }

  /* --- Phasen der 4-7-8-Atmung --- */
  var PHASES = [
    { name: "inhale", label: "Einatmen", duration: 4000 },
    { name: "hold",   label: "Halten",   duration: 7000 },
    { name: "exhale", label: "Ausatmen", duration: 8000 }
  ];

  var MIN_SCALE = 0.35;
  var MAX_SCALE = 1.0;
  var RING_CIRCUMFERENCE = 2 * Math.PI * 80; // r = 80 im SVG

  /* --- DOM --- */
  var stage = document.getElementById("stage");
  var breathBtn = document.getElementById("breathBtn");
  var fill = document.getElementById("fill");
  var ring = document.getElementById("ring");
  var phaseTextEl = document.getElementById("phaseText");
  var counterEl = document.getElementById("counter");
  var settingsToggle = document.getElementById("settingsToggle");
  var settingsPanel = document.getElementById("settingsPanel");

  /* --- Laufzeitzustand --- */
  var running = false;
  var phaseIndex = 0;
  var phaseStart = 0;
  var cycles = 0;
  var rafId = null;
  var colors = {}; // aus CSS gelesen

  /* ======================= Farben ======================= */
  function refreshColors() {
    var cs = getComputedStyle(document.documentElement);
    colors.inhale    = cs.getPropertyValue("--c-inhale").trim();
    colors.holdStart = cs.getPropertyValue("--c-hold-start").trim();
    colors.holdEnd   = cs.getPropertyValue("--c-hold-end").trim();
    colors.exhale    = cs.getPropertyValue("--c-exhale").trim();
    colors.idle      = cs.getPropertyValue("--c-idle").trim();
    colors.accent    = cs.getPropertyValue("--accent").trim();
  }

  function parseColor(str) {
    str = str.trim();
    if (str.charAt(0) === "#") {
      if (str.length === 4) {
        return [parseInt(str[1] + str[1], 16), parseInt(str[2] + str[2], 16), parseInt(str[3] + str[3], 16)];
      }
      return [parseInt(str.substr(1, 2), 16), parseInt(str.substr(3, 2), 16), parseInt(str.substr(5, 2), 16)];
    }
    var m = str.match(/(\d+)/g);
    return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
  }

  function lerpColor(a, b, t) {
    var ca = parseColor(a), cb = parseColor(b);
    var r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
    var g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
    var bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
    return "rgb(" + r + "," + g + "," + bl + ")";
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

  // Weicher, über die ganze Phase gleitender Sinuston
  function playGlide(fromFreq, toFreq, durMs) {
    if (!settings.sound || !audioCtx) return;
    var dur = durMs / 1000;
    var now = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(fromFreq, now);
    osc.frequency.linearRampToValueAtTime(toFreq, now + dur);
    var peak = 0.07;
    var fade = Math.min(0.9, dur * 0.3);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + fade);
    g.gain.setValueAtTime(peak, now + dur - fade);
    g.gain.linearRampToValueAtTime(0, now + dur);
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  // Meditative Klangschale zum Abschluss (Auto-Stopp)
  function playBowl() {
    if (!settings.sound || !audioCtx) return;
    var now = audioCtx.currentTime;
    var base = 320;
    var dur = 4.8;
    var partials = [
      { f: 1.0, g: 1.0 }, { f: 2.01, g: 0.55 }, { f: 2.71, g: 0.35 },
      { f: 3.93, g: 0.2 }, { f: 5.12, g: 0.12 }
    ];
    for (var i = 0; i < partials.length; i++) {
      var p = partials[i];
      var osc = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = base * p.f;
      var peak = 0.16 * p.g;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + dur + 0.1);
    }
  }

  function vibrate(pattern) {
    if (settings.vibration && navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }

  /* ======================= Ablauf ======================= */
  function start() {
    if (running) return;
    running = true;
    cycles = 0;
    phaseIndex = 0;
    phaseStart = performance.now();
    ensureAudio();
    breathBtn.classList.remove("smooth");
    stage.classList.add("running");
    breathBtn.setAttribute("aria-label", "Atmung beenden");
    updateCounter();
    onPhaseEnter(0);
    rafId = requestAnimationFrame(loop);
  }

  function stop(auto) {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    stage.classList.remove("running");
    breathBtn.setAttribute("aria-label", "Atmung starten");
    if (auto) playBowl();
    // Sanft in den Ruhezustand zurück
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
    // Ton pro Phase
    if (phase.name === "inhale") playGlide(196, 294, phase.duration);        // steigend
    else if (phase.name === "exhale") playGlide(294, 196, phase.duration);   // fallend
    // Halten bleibt still
    // Haptik an jeder Phasengrenze
    vibrate(phase.name === "hold" ? 20 : 35);
    if (settings.phaseText) phaseTextEl.textContent = phase.label;
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
        updateCounter();
        if (settings.autoStopCycles > 0 && cycles >= settings.autoStopCycles) {
          stop(true);
          return;
        }
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
      fillColor = useColor ? lerpColor(colors.holdStart, colors.holdEnd, t) : colors.accent;
      // Fortschrittsring einmal komplett herum
      ring.style.opacity = "1";
      ring.style.stroke = useColor ? lerpColor(colors.holdStart, colors.holdEnd, t) : colors.accent;
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
    counterEl.textContent = cycles > 0 ? cycles + (cycles === 1 ? " Runde" : " Runden") : "";
  }

  /* ======================= Theme ======================= */
  function applyTheme() {
    var root = document.documentElement;
    if (settings.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", settings.theme);
    refreshColors();
    if (!running) fill.style.fill = colors.idle;
  }

  /* ======================= UI verdrahten ======================= */
  function applyDisplayToggles() {
    stage.classList.toggle("show-phase", settings.phaseText);
    stage.classList.toggle("show-counter", settings.cycleCounter);
  }

  function syncControls() {
    document.getElementById("setTheme").value = settings.theme;
    document.getElementById("setSound").checked = settings.sound;
    document.getElementById("setColor").checked = settings.colorAnimation;
    document.getElementById("setVibration").checked = settings.vibration;
    document.getElementById("setPhaseText").checked = settings.phaseText;
    document.getElementById("setCounter").checked = settings.cycleCounter;
    document.getElementById("setAutoStop").value = String(settings.autoStopCycles);
  }

  function wireControls() {
    document.getElementById("setTheme").addEventListener("change", function (e) {
      settings.theme = e.target.value; saveSettings(); applyTheme();
    });
    document.getElementById("setSound").addEventListener("change", function (e) {
      settings.sound = e.target.checked; saveSettings(); if (settings.sound) ensureAudio();
    });
    document.getElementById("setColor").addEventListener("change", function (e) {
      settings.colorAnimation = e.target.checked; saveSettings();
    });
    document.getElementById("setVibration").addEventListener("change", function (e) {
      settings.vibration = e.target.checked; saveSettings(); if (settings.vibration) vibrate(15);
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

  /* Kreis: Start/Stopp */
  breathBtn.addEventListener("click", toggle);
  breathBtn.addEventListener("keydown", function (e) {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
  });

  /* Zahnrad + Panel */
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

  /* Auf System-Theme-Wechsel reagieren (nur im System-Modus) */
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (settings.theme === "system") applyTheme();
    });
  }

  /* --- Init --- */
  applyTheme();
  syncControls();
  applyDisplayToggles();
  wireControls();
  fill.style.transform = "scale(" + MIN_SCALE + ")";
})();
