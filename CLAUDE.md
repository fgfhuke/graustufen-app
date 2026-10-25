# Graustufen-App – Hinweise für Claude Code

Web-App (PWA), die Farbfotos in Schwarz-Weiß mit 2 bis 16 Graustufen umwandelt. Schwellen per Schieberegler,
optional bis zu 3 gemalte Bereiche mit eigenen Schwellen. Alles läuft lokal im Browser, keine Uploads.
Plan, Begründungen und Umsetzungsstand je Etappe: `PLAN.md` (bei neuen Funktionen dort eine Etappe ergänzen).

## Nutzer
- Einsteiger ohne Programmierkenntnisse. Erklärungen auf Deutsch, einfach, ohne unnötige Fachbegriffe.
- Testet selbst auf Mac (Safari, Dock-App) und echtem iPhone und schickt Screenshots.

## Befehle
```
npm run build && npx vite preview --port 4173   # App lokal (Dev-Server ohne HMR wegen CSP)
npm test                                         # Unit-Tests (Vitest, tests/unit)
npx playwright test                              # Browser-Tests: chromium, webkit, iphone (tests/e2e)
.venv/bin/python tests/fixtures/generate.py      # Testbilder erzeugen (Pillow in .venv, huge-*.jpg ist gitignored)
```
Veröffentlichen: Push auf `main` → GitHub Actions (`deploy.yml`) → https://fgfhuke.github.io/graustufen-app/
Repo: https://github.com/fgfhuke/graustufen-app (öffentlich). `gh` ist angemeldet als fgfhuke (mit `workflow`-Recht).

## Aufbau
- `src/core/` reine Funktionen ohne DOM, vollständig unit-getestet: Luminanz (Rec. 709), Schwellen, LUT,
  Histogramm, Bereiche (`zones.ts`: compose, Pinsel, Maskenvergrößerung), eigener Graustufen-JPEG-Encoder (`jpegGray.ts`).
- `src/workers/render.worker.ts`: Export in Originalauflösung, streifenweise (≤ 4 MP pro Streifen) wegen der
  iOS-Canvas-Grenze von ca. 16,7 MP. Kein großes Canvas, kein `convertToBlob` für das Ganze.
- `src/io/`: Prüfung per Magic Bytes und Dateiende, Dekodierung (nativ, HEIC-Reserve `heic-to/csp`), PDF (jsPDF, A4), Druck.
- `src/main.ts`: Zustand (`zones[0]` = ganzes Bild, `zones[1..]` = Bereiche), Vorschau ≤ 2000 px, Verdrahtung.

## Fallstricke (bereits einmal passiert)
- macOS-`sed` braucht `sed -i ''`.
- Strenge CSP in `index.html`: keine externen Quellen, WebAssembly nur über `'wasm-unsafe-eval'`.
- Flex-Kinder in `#panel` dürfen nicht schrumpfen (`flex-shrink: 0`), sonst verschwindet die Reiterleiste.
- `[hidden]` braucht `display: none !important`, weil Elemente eigenes `display` haben.
- Die Dock-App muss von der GitHub-Adresse installiert werden, nicht von localhost (aktualisiert sich sonst nie).
- Updates erreichen installierte Apps erst beim zweiten Öffnen (Service Worker).
- Playwright-WebKit kennt `-webkit-touch-callout` nicht; Textauswahl-Sperre explizit auf `*` setzen.

## Arbeitsweise
- Neue Funktion: kurz in `PLAN.md` beschreiben, Unit- und Browser-Tests ergänzen, alle Tests grün, Screenshot
  (Desktop und iPhone-Profil) prüfen, dann committen und pushen.
