# Social media

A short vertical video (1080×1920, ~43 s) for a WhatsApp status or an Instagram
story. It shows both exercises in real time, so viewers can breathe along, with
the app's own sounds. Not part of the website (the deploy excludes `social/`).

| File | Purpose |
| --- | --- |
| `status.html` | The animation. Everything is driven by `renderAt(t)`; open it in a browser and click for a live preview with sound. `?lang=en` for English, `?t=12` to jump to a second. |
| `render.mjs` | Captures the page frame by frame in headless Chrome, renders the soundtrack offline through [`../audio.js`](../audio.js) and muxes both with ffmpeg. |

```bash
node social/render.mjs de    # → social/out/478breathing-status-de.mp4
node social/render.mjs en    # → social/out/478breathing-status-en.mp4
node social/render.mjs de --audio-only   # soundtrack only, to check levels quickly
```

Needs Google Chrome and ffmpeg. The videos in `out/` are not committed; they
can be regenerated at any time.

**Sound:** ocean inhale, "deep" exhale, gong at the end. The mix is deliberately
quiet (about −28 LUFS for the breaths, peak −13 dBFS); the deep exhale is turned
down by 6 dB in the video so it sits level with the inhale.

**Font:** the hydrax.org sign-off uses hydrax.org's wordmark font Press Start 2P
(`fonts/`, SIL Open Font License 1.1), the rest the system font like the app.

## Timeline

| Time | Scene |
| --- | --- |
| 0–3 s | Intro: "Kurz durchatmen? Zwei Atemübungen. Ein Kreis." |
| 3.1 s | A small switch flips on ("Klänge an oder aus, frei wählbar"): sound is optional |
| 3.5–22.5 s | One 4-7-8 round: inhale 4, hold 7, exhale 8 (ocean sound) |
| 24–35 s | One resonance breath: 5.5 s in, 5.5 s out (ocean sound) |
| 35.3–43 s | Outro: the address and "Kostenlos · ohne Anmeldung · ohne Tracking" on top (where the exercise titles were), both exercises below, the end gong |
| 37.6–43 s | hydrax.org sign-off in neon (Tron style): the frame traces itself, then the text glows up, followed by the blinking underscore of the wordmark (`hydrax.org_`) |
