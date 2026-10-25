# Graustufen

Wandelt Farbfotos in Schwarz-Weiß-Bilder mit frei wählbarer Anzahl an Graustufen (2 bis 16) um.
Die Grenzen zwischen den Stufen stellen Sie mit Schiebereglern ein, die Vorschau reagiert sofort.
Alles läuft lokal im Browser, Fotos werden nie hochgeladen.

## Bedienung
1. Foto hineinziehen oder anklicken (JPEG, PNG, HEIC/HEIF; iPhone-Fotos funktionieren).
2. Anzahl der Graustufen einstellen, Griffe unter dem Histogramm verschieben (auch mit Pfeiltasten, Umschalt = 10er-Schritte).
3. „Original zeigen“ gedrückt halten zum Vergleichen.
4. JPEG speichern, PDF (A4) speichern oder drucken. Der Export erfolgt immer in voller Originalauflösung.

## Als Programm auf dem Mac
In Safari die App-Adresse öffnen, dann **Ablage → Zum Dock hinzufügen**. Danach startet sie wie ein normales Programm, auch ohne Internet.
Auf dem iPhone: **Teilen → Zum Home-Bildschirm** (Export in Vollauflösung ist dort wegen der Canvas-Grenze noch nicht vorbereitet, siehe PLAN.md, R3).

## Entwicklung
```
npm install
npm run build && npm run preview     # App unter http://localhost:4173
npm test                             # Unit-Tests (Vitest)
.venv/bin/python tests/fixtures/generate.py   # Testbilder erzeugen (einmalig, braucht Pillow in .venv)
npm run e2e                          # Browser-Tests (Chromium und WebKit)
```
Plan und Begründungen: [PLAN.md](PLAN.md). Lizenzen: [LIZENZEN.md](LIZENZEN.md).
