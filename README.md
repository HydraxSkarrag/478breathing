# 478breathing

A deliberately minimalist web page that guides the **4-7-8 breathing technique**
(inhale for 4 seconds, hold for 7, exhale for 8) and **resonance breathing** (inhale and
exhale evenly at about 5.5 seconds each, as described in James Nestor's *Breath*).

The UI is a single circle: tap to start the guided breathing, tap again (or the stop
icon) to end it. The interface is bilingual (English by default, German switchable in the
settings); the legal pages (Impressum/Datenschutz) are German only.

## Features

- **Circle animation:** grows while inhaling (green), stays large while holding, shrinks while
  exhaling (blue). The **hold indicator** is switchable in the settings: a *dot* growing from
  the center until it fills the circle (default), a progress *ring* tracing the rim once, or a
  gentle *pulse* (a calm breathing glow, no precise timer).
- **Synthesized sound** (Web Audio, off by default): a soft "ocean breath" that swells on
  the inhale and ebbs on the exhale, silence while holding, plus a soft gong when a session
  ends via auto-stop. No audio files — everything is generated in the browser. A separate
  **sound page** ([`sound.html`](sound.html)) lets you pick and preview a different sound per
  phase (e.g. gusty wind, rain, a warm pad, a deeper duller exhale, a temple bell, harp or
  wind chimes). Every breath sound is directional: it rises with the inhale and sinks with
  the exhale.
- **Two exercises**, switchable in the settings:
  - **4-7-8** with an optional lead-in exhale and auto-stop counted in rounds.
  - **Resonance breathing** with a selectable pace (5 / 5.5 / 6 s per breath, 5.5 by
    default) and auto-stop counted in minutes; the counter shows the time left. Two faint
    rings breathe along with the circle. A session
    always ends after a complete breath.
- **Settings in two tabs:** *Breathing* shows only the options of the chosen exercise
  (e.g. the hold display only exists for 4-7-8), *General* holds language, theme, sound and
  display options.
- **Explainer page** ([`technique.html`](technique.html), bilingual DE/EN): how both
  exercises work and what they can help with, linked from the footer.
- **Follows Dr. Weil's instructions:** an optional lead-in exhale before the first round
  ("Exhale first", off by default) and auto-stop after **4 rounds** by default, his limit for
  the first month (8 at most later, so no larger option is offered).
- **Optional extras** (all toggleable): phase label, cycle counter, auto-stop after N rounds.
- **Theme:** system / light / dark. **Color animation can be disabled** (monochrome).
- **Screen stays awake** during a session (Screen Wake Lock API).
- **Installable and offline capable:** web app manifest plus a small service worker
  ([`sw.js`](sw.js)), so the page can be added to the home screen and keeps working without a
  connection (versioned CSS/JS cache first, everything else network first).
- **Accessible and considerate:** the settings panel scrolls on short screens, the sound
  picker is a proper ARIA radio group, and `prefers-reduced-motion` visibly tames the circle
  animation instead of only the CSS transitions.
- **Privacy-friendly:** no cookies, no tracking, no external resources. Settings are stored
  locally in the browser (`localStorage`) only.

Plain HTML/CSS/JS — no dependencies, no build step.

### Files

| File                   | Purpose                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `index.html` / `app.js`| The exercise itself: circle, settings panel, session flow          |
| `audio.js`             | Shared Web Audio synthesis (`window.BreathAudio`)                  |
| `page.js`              | Shared bootstrap: theme before first paint, language, `theme-color`|
| `sound.html` / `sound.js` | Sound picker with previews                                      |
| `technique.html`, `about.html` | Bilingual content pages (DE/EN)                            |
| `impressum.html`, `datenschutz.html` | Legal pages (German only)                            |
| `sw.js`, `site.webmanifest` | Offline support and home-screen install                       |
| `social/`             | Status video for WhatsApp/Instagram (not deployed), see [`social/README.md`](social/README.md) |

There are no inline scripts or styles anywhere, which keeps the Content-Security-Policy in
[`.htaccess`](.htaccess) strict (`script-src 'self'; style-src 'self'`).

## Local development

Any static server works, for example:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Note that the service worker only registers over
`http(s)`, and that `.htaccess` (caching, security headers) is applied by Apache only.

## Deployment (GitHub Actions → any FTP/FTPS host)

Every push to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which mirrors the site to any FTP server via `lftp`. Nothing is hard-coded to a specific host —
just point the secrets at your server. Before uploading it appends `?v=<commit-sha>` to every
local CSS/JS URL (cache busting) so browsers always fetch the current version after a deploy.
The upload runs in two passes (assets first, HTML last) and replaces every file via a
temporary name, so visitors never see new HTML pointing at an asset that isn't there yet.

Set these secrets under **Settings → Environments → `production`**:

| Secret         | Description                                |
| -------------- | ------------------------------------------ |
| `FTP_SERVER`   | FTP host (e.g. `ftp.example.com`)          |
| `FTP_USERNAME` | FTP username                               |
| `FTP_PASSWORD` | FTP password                               |

Optional **variables** (not secrets):

| Variable         | Description                                                          |
| ---------------- | ------------------------------------------------------------------- |
| `FTP_SERVER_DIR` | Target directory on the server (e.g. `/example.com/`); defaults to the FTP home |
| `FTP_TLS`        | Set to `false` for plain FTP if the host doesn't support FTPS (default: TLS on) |
| `FTP_VERIFY_CERT`| Set to `false` only if the FTPS certificate doesn't match `FTP_SERVER` (default: verified) |
| `SITE_URL`       | Canonical site URL without trailing slash (e.g. `https://example.com`). If set, it replaces the default domain in the share tags, the canonical links, `sitemap.xml` and `robots.txt` at deploy time |

If the secrets are missing the workflow does not fail — it skips the deploy with a warning.
Tested against all-inkl (FTPS), but works with any standard FTP/FTPS host.

## Sharing

The page ships with Open Graph / Twitter card tags and a share image
([`og-image.png`](og-image.png), 1200×630), so links unfurl nicely on social media.
If you host it on a different domain, set the `SITE_URL` variable (see above) — the deploy
workflow then rewrites the absolute URLs in the `og:*` / `twitter:*` meta tags for you. The
domain text baked into the image is separate; regenerate `og-image.png` if you want it changed,
and bump the `?v=` on its URL in `index.html` so messengers fetch the new image.

Suggested captions:

- **DE:** „Zwei ruhige Atemübungen, geführt von einem Kreis: 4-7-8 zum Runterkommen und die
  Resonanzatmung mit etwa 5,5 Atemzügen pro Minute. Ohne Anmeldung, mit optionalem Ton.
  🫁 https://478breathing.hydrax.org"
- **EN:** "Two calm breathing exercises, guided by a single circle: 4-7-8 to wind down and
  resonance breathing at about 5.5 breaths a minute. No sign-up, optional sound.
  🫁 https://478breathing.hydrax.org"

## License

[MIT](LICENSE)
