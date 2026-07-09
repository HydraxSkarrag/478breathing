# 478breathing

A deliberately minimalist web page that guides the **4-7-8 breathing technique**:
inhale for 4 seconds, hold for 7, exhale for 8.

The UI is a single circle: tap to start the guided breathing, tap again (or the stop
icon) to end it. The interface is in German; the site targets a German-speaking audience.

## Features

- **Circle animation:** grows while inhaling (green), stays large while holding with a
  progress ring tracing the rim once (yellow fill, orange ring), shrinks while exhaling (blue).
- **Synthesized sound** (Web Audio, off by default): a soft "ocean breath" that swells on
  the inhale and ebbs on the exhale, silence while holding, plus a gentle singing-bowl
  chime when a session ends via auto-stop. No audio files — everything is generated in the browser.
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

If the secrets are missing the workflow does not fail — it skips the deploy with a warning.
Tested against all-inkl (FTPS), but works with any standard FTP/FTPS host.

## License

[MIT](LICENSE)
