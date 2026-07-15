# 478breathing

A deliberately minimalist web page that guides the **4-7-8 breathing technique**:
inhale for 4 seconds, hold for 7, exhale for 8.

The UI is a single circle: tap to start the guided breathing, tap again (or the stop
icon) to end it. The interface is bilingual (German by default, English switchable in the
settings); the legal pages (Impressum/Datenschutz) are German only.

## Features

- **Circle animation:** grows while inhaling (green), stays large while holding, shrinks while
  exhaling (blue). The **hold indicator** is switchable in the settings: a progress *ring*
  tracing the rim once (default), or a *dot* growing from the center until it fills the circle.
- **Synthesized sound** (Web Audio, off by default): a soft "ocean breath" that swells on
  the inhale and ebbs on the exhale, silence while holding, plus a soft gong when a session
  ends via auto-stop. No audio files — everything is generated in the browser. A separate
  **sound page** ([`sound.html`](sound.html)) lets you pick and preview a different sound per
  phase (e.g. gusty wind, rain, a warm pad, a deeper duller exhale, a temple bell, harp or
  wind chimes). Every breath sound is directional: it rises with the inhale and sinks with
  the exhale.
- **Explainer page** ([`technik.html`](technik.html), bilingual DE/EN): what the 4-7-8
  technique is, how to do it and what it can help with, linked from the footer.
- **Optional extras** (all toggleable): phase label, cycle counter, auto-stop after N rounds.
- **Theme:** system / light / dark. **Color animation can be disabled** (monochrome).
- **Screen stays awake** during a session (Screen Wake Lock API).
- **Privacy-friendly:** no cookies, no tracking, no external resources. Settings are stored
  locally in the browser (`localStorage`) only.

Plain HTML/CSS/JS — no dependencies, no build step.

## Local development

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deployment (GitHub Actions → any FTP/FTPS host)

Every push to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which mirrors the site to any FTP server via `lftp`. Nothing is hard-coded to a specific host —
just point the secrets at your server. Before uploading it appends `?v=<commit-sha>` to the
CSS/JS URLs (cache busting) so browsers always fetch the current version after a deploy.

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
| `SITE_URL`       | Canonical site URL without trailing slash (e.g. `https://example.com`). If set, it replaces the default domain in the social-share tags at deploy time |

If the secrets are missing the workflow does not fail — it skips the deploy with a warning.
Tested against all-inkl (FTPS), but works with any standard FTP/FTPS host.

## Sharing

The page ships with Open Graph / Twitter card tags and a share image
([`og-image.png`](og-image.png), 1200×630), so links unfurl nicely on social media.
If you host it on a different domain, set the `SITE_URL` variable (see above) — the deploy
workflow then rewrites the absolute URLs in the `og:*` / `twitter:*` meta tags for you. The
domain text baked into the image is separate; regenerate `og-image.png` if you want it changed.

Suggested captions:

- **DE:** „4-7-8-Atmung zum Runterkommen: 4 Sekunden einatmen, 7 halten, 8 ausatmen. Ein
  Kreis führt dich – ganz ohne Anmeldung, mit optionalem Ton. 🫁 https://478breathing.hydrax.org"
- **EN:** "Calm down with 4-7-8 breathing: inhale 4s, hold 7s, exhale 8s. A single circle
  guides you — no sign-up, optional sound. 🫁 https://478breathing.hydrax.org"

## License

[MIT](LICENSE)
