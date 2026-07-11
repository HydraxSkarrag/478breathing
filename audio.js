/* ---------------------------------------------------------------------------
   4-7-8 breathing — shared sound engine (window.BreathAudio)

   Everything is synthesized in the browser with the Web Audio API; there are
   no audio files. Each phase offers several variants so the sound can be tuned
   on the dedicated sound page (sound.html). The main app and that page both
   drive this single module.

   API:
     BreathAudio.resume()               -> create/resume the AudioContext
                                           (must run inside a user gesture)
     BreathAudio.inhale(variant, durMs) -> play an inhale sound
     BreathAudio.exhale(variant, durMs) -> play an exhale sound
     BreathAudio.end(variant)           -> play a session-end sound
     BreathAudio.INHALE / .EXHALE / .END -> list of available variant ids
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var ctx = null;      // lazily created on the first user gesture
  var master = null;
  var noiseBuffer = null;

  // Create the AudioContext (browsers require a user gesture) and resume it.
  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // Pink-noise buffer (created once) — the basis for the "ocean" / breath sounds.
  function noise() {
    if (noiseBuffer) return noiseBuffer;
    var len = Math.floor(ctx.sampleRate * 2);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
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

  /* --------------------------------------------------------------------- */
  /*  Building blocks                                                       */
  /* --------------------------------------------------------------------- */

  // Shared per-phase loudness envelope: swell in (audible right to the end,
  // with a short soft hand-off) / rise quickly and fade out long.
  function phaseEnv(g, dir, now, dur, peak) {
    g.gain.setValueAtTime(0.0001, now);
    if (dir === "in") {
      g.gain.linearRampToValueAtTime(peak, now + dur * 0.3);
      g.gain.setValueAtTime(peak, now + dur * 0.92);
      g.gain.linearRampToValueAtTime(0.0001, now + dur);
    } else {
      g.gain.linearRampToValueAtTime(peak, now + dur * 0.15);
      g.gain.linearRampToValueAtTime(0.0001, now + dur);
    }
  }

  // Filtered pink noise that swells (inhale) or ebbs (exhale) across the whole
  // phase, so each start/end marks a phase change even with the eyes closed.
  // opts: { f0, f1 (filter sweep), peak, q, type (filter type, default lowpass),
  //         fmod: { freq, depth } (slow wobble on the filter – gusty wind) }
  function breathNoise(dir, durMs, opts) {
    var dur = durMs / 1000;
    var now = ctx.currentTime;

    var src = ctx.createBufferSource();
    src.buffer = noise();
    src.loop = true;

    var filter = ctx.createBiquadFilter();
    filter.type = opts.type || "lowpass";
    filter.Q.value = opts.q != null ? opts.q : 0.8;
    filter.frequency.setValueAtTime(opts.f0, now);
    filter.frequency.linearRampToValueAtTime(opts.f1, now + dur);

    if (opts.fmod) {
      // slow wobble on the filter center -> gusts instead of a static hiss
      var lfo = ctx.createOscillator();
      var lfoGain = ctx.createGain();
      lfo.frequency.value = opts.fmod.freq;
      lfoGain.gain.value = opts.fmod.depth; // ± Hz around the sweep
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start(now);
      lfo.stop(now + dur + 0.05);
    }

    var g = ctx.createGain();
    src.connect(filter).connect(g).connect(master);
    phaseEnv(g, dir, now, dur, opts.peak);

    src.start(now);
    src.stop(now + dur + 0.05);
  }

  // Warm pad: a soft chord (root, fifth, octave) of detuned triangles behind a
  // slowly opening/closing lowpass – a meditative swell without melody.
  function breathPad(dir, durMs) {
    var dur = durMs / 1000;
    var now = ctx.currentTime;

    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.5;
    // wide sweep so the direction is unmistakable: opens up on the inhale,
    // settles down on the exhale
    lp.frequency.setValueAtTime(dir === "in" ? 300 : 1100, now);
    lp.frequency.linearRampToValueAtTime(dir === "in" ? 1100 : 260, now + dur);

    var g = ctx.createGain();
    lp.connect(g).connect(master);
    phaseEnv(g, dir, now, dur, 0.05);

    [110, 164.81, 220].forEach(function (f) { // A2, E3, A3
      [-5, 5].forEach(function (cents) {
        var osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = f;
        osc.detune.value = cents;
        osc.connect(lp);
        osc.start(now);
        osc.stop(now + dur + 0.05);
      });
    });
  }

  // "Om": a voice-like hum – detuned saws through two formant band-passes
  // (the vowel color) plus a sine for body. The vowel opens on the inhale
  // and closes towards a hummed "m" on the exhale.
  function breathOm(dir, durMs) {
    var dur = durMs / 1000;
    var now = ctx.currentTime;

    var g = ctx.createGain();
    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    g.connect(lp).connect(master);
    phaseEnv(g, dir, now, dur, 0.07);

    var f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.Q.value = 5;
    var f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.Q.value = 7;
    var f2g = ctx.createGain();
    f2g.gain.value = 0.5;
    f1.connect(g);
    f2.connect(f2g).connect(g);
    if (dir === "in") { // m -> o (mouth opens)
      f1.frequency.setValueAtTime(260, now);
      f1.frequency.linearRampToValueAtTime(480, now + dur);
      f2.frequency.setValueAtTime(850, now);
      f2.frequency.linearRampToValueAtTime(1100, now + dur);
    } else {            // o -> m (closes into a hum)
      f1.frequency.setValueAtTime(480, now);
      f1.frequency.linearRampToValueAtTime(250, now + dur);
      f2.frequency.setValueAtTime(1100, now);
      f2.frequency.linearRampToValueAtTime(830, now + dur);
    }

    // gentle pitch glide underlines the direction: rises in, sinks out
    var p0 = dir === "in" ? 92 : 104;
    var p1 = dir === "in" ? 104 : 88;

    [-6, 6].forEach(function (cents) {
      var osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(p0, now); // around G2 – a low hum
      osc.frequency.exponentialRampToValueAtTime(p1, now + dur);
      osc.detune.value = cents;
      osc.connect(f1);
      osc.connect(f2);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    });

    // plain sine at the fundamental for chest/body
    var body = ctx.createOscillator();
    var bodyG = ctx.createGain();
    body.type = "sine";
    body.frequency.setValueAtTime(p0, now);
    body.frequency.exponentialRampToValueAtTime(p1, now + dur);
    bodyG.gain.value = 0.6;
    body.connect(bodyG).connect(g);
    body.start(now);
    body.stop(now + dur + 0.05);
  }

  /* --------------------------------------------------------------------- */
  /*  Inhale variants                                                       */
  /* --------------------------------------------------------------------- */
  var INHALE = {
    off: function () {},
    // deep, broad noise wash, dark -> bright – like breath/surf
    ocean: function (d) { breathNoise("in", d, { f0: 420, f1: 1150, peak: 0.11 }); },
    // clearly distinct from ocean: a hollow, whistling band of air that rises
    // and gusts (wobbling band-pass instead of a broad dark wash)
    wind: function (d) { breathNoise("in", d, { type: "bandpass", f0: 900, f1: 2800, peak: 0.17, q: 2.2, fmod: { freq: 0.7, depth: 260 } }); },
    // fine patter that grows denser/fuller as the breath comes in
    rain: function (d) { breathNoise("in", d, { type: "highpass", f0: 3400, f1: 2000, peak: 0.2, q: 0.5 }); },
    // warm chord pad swelling behind an opening filter
    pad: function (d) { breathPad("in", d); },
    // voice-like hum that rises and opens towards an "o"
    om: function (d) { breathOm("in", d); }
  };

  /* --------------------------------------------------------------------- */
  /*  Exhale variants                                                       */
  /* --------------------------------------------------------------------- */
  var EXHALE = {
    off: function () {},
    // deep, broad noise wash, bright -> dark, long fade
    ocean: function (d) { breathNoise("out", d, { f0: 1050, f1: 360, peak: 0.11 }); },
    // the wind's counterpart: the whistling band sinks and drifts away
    wind: function (d) { breathNoise("out", d, { type: "bandpass", f0: 2800, f1: 800, peak: 0.17, q: 2.2, fmod: { freq: 0.6, depth: 260 } }); },
    // fine patter that thins out and recedes as the breath goes out
    rain: function (d) { breathNoise("out", d, { type: "highpass", f0: 2000, f1: 3600, peak: 0.2, q: 0.5 }); },
    // warm chord pad settling behind a closing filter
    pad: function (d) { breathPad("out", d); },
    // voice-like hum that sinks and closes into an "m"
    om: function (d) { breathOm("out", d); },
    // requested suggestion: deeper & duller. A darker filter sweep plus a low
    // sine drone underneath that fades away – a heavier, "sinking" exhale.
    deep: function (d) {
      breathNoise("out", d, { f0: 820, f1: 165, peak: 0.085, q: 0.6 });
      var dur = d / 1000;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(88, now);   // low body
      osc.frequency.linearRampToValueAtTime(62, now + dur); // sinks further
      var lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 220;
      var g = ctx.createGain();
      osc.connect(g).connect(lp).connect(master);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.07, now + dur * 0.2);
      g.gain.linearRampToValueAtTime(0.0001, now + dur);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    }
  };

  /* --------------------------------------------------------------------- */
  /*  End-of-session variants (played on auto-stop)                         */
  /* --------------------------------------------------------------------- */

  // Deep, soft gong rumble: very low fundamental with overtones, slow beating,
  // dark fade-out. A rumble you can feel on headphones.
  function endGong() {
    var now = ctx.currentTime;
    var dur = 9;

    var env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(1, now + 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.5;
    filter.frequency.setValueAtTime(700, now);
    filter.frequency.linearRampToValueAtTime(200, now + dur);
    filter.connect(env).connect(master);

    var base = 62;
    var partials = [{ f: 1.0, g: 1.0 }, { f: 2.0, g: 0.55 }, { f: 3.0, g: 0.28 }, { f: 4.02, g: 0.12 }];
    partials.forEach(function (p) {
      [0, 1.5].forEach(function (detune) { // two detuned voices -> slow beating
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = base * p.f + detune;
        g.gain.value = 0.045 * p.g;
        osc.connect(g).connect(filter);
        osc.start(now);
        osc.stop(now + dur + 0.1);
      });
    });
  }

  // Singing bowl: a mid fundamental with inharmonic, bell-like partials and a
  // long shimmering decay – brighter and more "ringing" than the gong.
  function endBowl() {
    var now = ctx.currentTime;
    var dur = 7;

    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.5;
    lp.frequency.value = 2600;
    lp.connect(master);

    var base = 210;
    var partials = [{ f: 1.0, g: 1.0 }, { f: 2.76, g: 0.5 }, { f: 5.40, g: 0.26 }, { f: 8.93, g: 0.12 }];
    partials.forEach(function (p) {
      [0, 0.6].forEach(function (detune) { // light beating -> gentle shimmer
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = base * p.f + detune;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.05 * p.g, now + 0.04);
        // higher partials fade faster (as in a real bowl)
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur * (0.4 + 0.6 / p.f));
        osc.connect(g).connect(lp);
        osc.start(now);
        osc.stop(now + dur + 0.1);
      });
    });
  }

  // Temple bell: a single, low strike with inharmonic partials – sits between
  // the gong (rumble) and the chime (light).
  function endBell() {
    var now = ctx.currentTime;
    var dur = 8;

    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(1900, now);
    lp.frequency.linearRampToValueAtTime(600, now + dur); // darkens as it rings
    lp.connect(master);

    var base = 170;
    var partials = [{ f: 1.0, g: 1.0 }, { f: 2.74, g: 0.55 }, { f: 4.07, g: 0.28 }, { f: 5.9, g: 0.13 }];
    partials.forEach(function (p) {
      [0, 0.8].forEach(function (detune) { // light beating -> living decay
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = base * p.f + detune;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.055 * p.g, now + 0.015); // the strike
        // higher partials fade faster (as in a real bell)
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur * (0.45 + 0.55 / p.f));
        osc.connect(g).connect(lp);
        osc.start(now);
        osc.stop(now + dur + 0.1);
      });
    });
  }

  // Harp: a gentle descending three-note figure, each note softly plucked.
  function endHarp() {
    var now = ctx.currentTime;
    var notes = [329.63, 261.63, 196.0]; // E4 -> C4 -> G3, "coming to rest"

    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    lp.connect(master);

    notes.forEach(function (f, i) {
      var t = now + i * 0.9;
      [1, 2].forEach(function (mult) { // fundamental plus a quiet octave
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = f * mult;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(mult === 1 ? 0.06 : 0.02, t + 0.015); // pluck
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
        osc.connect(g).connect(lp);
        osc.start(t);
        osc.stop(t + 3.3);
      });
    });
  }

  // Wind chimes: a few random, delicate high notes (pentatonic, so any
  // combination sounds consonant) that ring out – different on every play.
  function endWindchime() {
    var now = ctx.currentTime;
    var scale = [1046.5, 1174.66, 1318.51, 1567.98, 1760.0]; // C6 pentatonic
    for (var i = 0; i < 5; i++) {
      var t = now + (i === 0 ? 0 : Math.random() * 2.8);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = scale[Math.floor(Math.random() * scale.length)];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 2.9);
    }
  }

  var END = {
    off: function () {},
    gong: endGong,
    bowl: endBowl,
    bell: endBell,
    harp: endHarp,
    windchime: endWindchime
  };

  function pick(map, variant) {
    return Object.prototype.hasOwnProperty.call(map, variant) ? map[variant] : null;
  }

  window.BreathAudio = {
    resume: function () { return ensure(); },
    inhale: function (variant, durMs) {
      if (!ensure()) return;
      (pick(INHALE, variant) || INHALE.ocean)(durMs);
    },
    exhale: function (variant, durMs) {
      if (!ensure()) return;
      (pick(EXHALE, variant) || EXHALE.ocean)(durMs);
    },
    end: function (variant) {
      if (!ensure()) return;
      (pick(END, variant) || END.gong)();
    },
    INHALE: ["ocean", "wind", "rain", "pad", "om", "off"],
    EXHALE: ["ocean", "wind", "deep", "rain", "pad", "om", "off"],
    END: ["gong", "bowl", "bell", "harp", "windchime", "off"]
  };
})();
