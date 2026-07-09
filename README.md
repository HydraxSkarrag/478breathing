# 4-7-8 Atmung

Eine bewusst minimalistische Webseite zur Unterstützung der **4-7-8-Atemtechnik**:
4 Sekunden einatmen, 7 Sekunden halten, 8 Sekunden ausatmen.

Ein einzelner Kreis ist die gesamte Bedienung: antippen startet die geführte Atmung,
erneut antippen (bzw. Stopp-Icon) beendet sie.

## Funktionen

- **Kreis-Animation:** wächst beim Einatmen (Grün), bleibt beim Halten groß mit einem einmal
  umlaufenden Rand-Fortschrittsring (Gelb → Orange), schrumpft beim Ausatmen (Blau).
- **Synthetischer Ton** (Web Audio, standardmäßig aus): sanft steigender Ton beim Einatmen,
  Stille beim Halten, sanft fallender Ton beim Ausatmen – jede Tongrenze markiert einen
  Phasenwechsel. Optionale **Klangschale** als Abschluss bei Auto-Stopp.
- **Extras** (alle abschaltbar): Vibration an Phasenübergängen, Zyklus-Zähler,
  Auto-Stopp nach X Runden, einblendbarer Phasen-Text.
- **Design:** System / Hell / Dunkel. **Farbwechsel abschaltbar** (monochrom).
- **Datensparsam:** keine Cookies, kein Tracking, keine externen Ressourcen. Einstellungen
  liegen ausschließlich lokal im Browser (`localStorage`).

Reines HTML/CSS/JS ohne Abhängigkeiten oder Build-Schritt.

## Lokal testen

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Deployment (GitHub Actions → all-inkl per FTPS)

Bei jedem Push auf `main` deployt [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
automatisch per FTPS zu all-inkl. Der Workflow hängt zuvor `?v=<commit-sha>` an die CSS/JS-URLs
an (Cache-Busting), sodass Browser nach jedem Deploy die aktuelle Version laden.

Dafür im Repository unter **Settings → Environments → `production`** diese Secrets setzen:

| Secret         | Bedeutung                                  |
| -------------- | ------------------------------------------ |
| `FTP_SERVER`   | FTP-Host (z. B. `wXXYYYY.kasserver.com`)   |
| `FTP_USERNAME` | FTP-Benutzername                           |
| `FTP_PASSWORD` | FTP-Passwort                               |

Optional als **Variable** (nicht Secret):

| Variable         | Bedeutung                                                        |
| ---------------- | --------------------------------------------------------------- |
| `FTP_SERVER_DIR` | Ziel-Verzeichnis der Subdomain (z. B. `/478breathing.hydrax.org/`) |

Ohne gesetzte Secrets bricht der Workflow nicht ab, sondern überspringt den Deploy mit einer Warnung.

### Subdomain (all-inkl)

Im all-inkl-KAS die gewünschte Subdomain anlegen und deren Dokumentenverzeichnis als
`FTP_SERVER_DIR` hinterlegen. Fertig – der nächste Push veröffentlicht die Seite dort.

## Lizenz

[MIT](LICENSE)
