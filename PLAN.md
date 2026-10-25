# PLAN.md – Graustufen-App (Posterisierung in Grau)

## Kontext

Gewünscht ist eine App, die ein Farbfoto in ein Schwarz-Weiß-Bild mit frei wählbarer Anzahl an Graustufen
umwandelt. Der Nutzer legt mit Schiebereglern fest, bei welcher Helligkeit die Grenze zwischen zwei Stufen
liegt, und sieht das Ergebnis sofort. Export als JPEG, PDF (A4) und direkt in den Druckdialog.

Entscheidungen aus den Rückfragen:

| Frage | Antwort |
|---|---|
| Geräte | Nur dieser Mac (macOS 15.7), später auch iPhone/iPad |
| Start der App | „Richtiges Programm“, umgesetzt als Safari-Web-App im Dock („Zum Dock hinzufügen“) |
| Fotos pro Durchgang | Ein Foto nach dem anderen |
| Fotoquellen | iPhone-HEIC (12–48 MP), Kamera-JPEG (20–60 MP), kleine PNG/JPEG |
| Bereitstellung | GitHub Pages (Code öffentlich, Fotos bleiben immer lokal) |
| Papier | Nur A4, Ausrichtung automatisch, Bild mit Rand eingepasst |

Auf dem Mac vorhanden: Homebrew, Python 3.14, Safari, Chrome, Firefox. **Nicht** vorhanden: Node.js (wird in Etappe 0 installiert).

---

## 1. Zusammenfassung und Technologieentscheidung

### Empfehlung: Lokale Web-App (PWA) mit Vite + TypeScript, ohne Framework

Die App ist eine normale Webseite, die vollständig im Browser rechnet. Es gibt keinen Server, der Fotos
annimmt; GitHub Pages liefert nur die App-Dateien aus (wie ein USB-Stick im Internet). Auf dem Mac wird sie in
Safari über **Ablage → Zum Dock hinzufügen** zu einem eigenen Programm mit Symbol und eigenem Fenster
(ab macOS 14, hier 15.7). Auf dem iPhone später über **Teilen → Zum Home-Bildschirm**. Ein Service Worker
macht die App auch ohne Internet startbar.

Entscheidender Vorteil: **Safari kann HEIC selbst dekodieren** (Mac und iPhone). Chrome und Firefox können es
nicht; dort springt eine kleine Zusatzbibliothek ein (siehe unten). Da der Nutzer Safari auf Mac und iPhone
nutzt, ist der schnelle Weg der Normalfall und der langsame nur die Reserve.

### Vergleich der Varianten

| Kriterium | **A: Web-App / PWA (Empfehlung)** | B: Desktop-App mit Tauri 2 | C: Desktop-App mit Electron | D: Native Swift-App |
|---|---|---|---|---|
| Aufwand bis zur ersten lauffähigen Version | Gering: Browser öffnen, fertig. Kein Compiler, keine Signierung | Mittel bis hoch: Rust-Werkzeuge, Xcode; für iPhone Apple-Entwicklerkonto | Mittel; Build und Paketierung, ca. 200 MB App | Hoch: Xcode, SwiftUI; Claude Code kann die Oberfläche nicht selbst sehen/testen |
| HEIC-Unterstützung | Safari nativ; Chrome/Firefox über WebAssembly-Bibliothek | Nutzt auf dem Mac den Safari-Kern (WKWebView), also nativ | Chromium-Kern: nur über WebAssembly-Bibliothek | Nativ und am schnellsten (ImageIO) |
| Leistung bei 48–60-MP-Fotos | Gut auf dem Mac (Vorschau verkleinert, Vollauflösung im Hintergrund-Thread). Auf dem iPhone Grenzen beim Export (siehe Risiken) | Wie A, gleicher Browser-Kern | Wie A | Am besten |
| Installation für den Nutzer | Einmal „Zum Dock hinzufügen“; Updates automatisch | Signierte .app, Updates manuell oder über Update-System | .app, Updates manuell | App Store oder Xcode-Installation |
| iPhone später | Ja, gleiche Adresse, gleiche App | Ja, aber Xcode, Signierung, Apple-Konto | Nein | Ja, aber eigener Oberflächen-Code |
| Wartbarkeit für Einsteiger mit Claude Code | Sehr gut: eine Sprache (TypeScript), sofort im Browser prüfbar, Playwright kann automatisch testen | Gut, aber zwei Sprachen (Rust + TypeScript) und mehr Werkzeuge | Mittel: große Abhängigkeit, Sicherheits-Updates nötig | Mittel: Swift-Tooling, Tests nur in Xcode |
| Lizenz der Basis | Vite 8.3.5 (MIT) | @tauri-apps/cli 2.12.4 (MIT oder Apache-2.0) | Electron 45.0.0 (MIT) | Apple-SDK |

**Warum nicht B:** Tauri wäre der richtige Weg, wenn eine „echte“ .app zwingend wäre. Der Nutzer hat die
Dock-Web-App akzeptiert. Da Tauri denselben Web-Code einpackt, bleibt B als späterer Umstieg offen, ohne
etwas wegzuwerfen. **Warum nicht C:** kein iPhone, kein natives HEIC, großes Paket. **Warum nicht D:**
Einstiegshürde und schlechte Testbarkeit für Claude Code.

### Bibliotheken (per Websuche geprüft am 25.10.2026, npm-Registry)

| Zweck | Bibliothek | Version | Lizenz | Bewertung |
|---|---|---|---|---|
| HEIC-Reserve-Dekoder (Chrome/Firefox) | **heic-to** | 1.6.6 | LGPL-3.0 | Aktiv gepflegt, bündelt libheif 1.23.6, läuft im Web Worker. **Gewählt.** |
| HEIC-Alternative | libheif-js | 1.23.5 | LGPL-3.0 | Roher Unterbau von heic-to, mehr Handarbeit. Reserve. |
| HEIC-Alternative | heic2any | 0.0.4 | MIT | Seit Jahren nicht gepflegt, altes libheif. **Nicht verwenden.** |
| PDF erzeugen | **jsPDF** | 4.2.1 | MIT | Aktiv, bettet JPEG direkt ohne Neukodierung ein. **Gewählt.** |
| PDF-Alternative | pdf-lib | 1.17.1 | MIT | Letzte Veröffentlichung 2021, daher nicht gewählt. |
| Build-Werkzeug | Vite | 8.3.5 | MIT | Standard, einfache Einrichtung. |
| PWA (Manifest, Offline) | vite-plugin-pwa | 2.0.0 | MIT | Erzeugt Service Worker und Manifest. |
| Unit-Tests | Vitest | 5.0.5 | MIT | Passt zu Vite. |
| Browser-Tests | @playwright/test | 1.64.1 | Apache-2.0 | Kann **WebKit (Safari-Kern) und Chromium** automatisiert testen, wichtig für den HEIC-Doppelweg. |

**Zur LGPL-3.0 von heic-to/libheif:** Die Bibliothek wird unverändert als eigenständige WebAssembly-Datei
geladen; der eigene App-Code bleibt unter MIT. Für eine private Nutzung ist das unproblematisch. Die Lizenz-
Hinweise werden in einer `LIZENZEN.md` im Projekt mitgeliefert. (Keine Rechtsberatung.)

Weitere Formate (Vorschlag, nicht im Pflichtumfang): **WebP, AVIF, GIF, BMP** dekodiert jeder aktuelle Browser
selbst, Aufwand nur Erweiterung der Dateiprüfung (< 1 Stunde). **TIFF** kann kein Browser; dafür wäre eine
Zusatzbibliothek (z. B. UTIF.js, MIT) nötig, Aufwand ca. ein halber Tag inkl. Tests. **RAW/DNG** nicht sinnvoll.

---

## 2. Funktionsumfang und Benutzeroberfläche

### Bedienablauf

1. App öffnen. Großer Bereich „Foto hier hineinziehen oder klicken zum Auswählen“ (Datei-Dialog nur Bilddateien).
2. Nach dem Laden erscheint links die Vorschau (Ergebnis), rechts die Bedienleiste:
   - **Anzahl Graustufen**: Zahlenfeld mit Plus/Minus, Bereich **2 bis 16**.
   - **Schwellenwert-Leiste**: ein Balken von Schwarz (0) bis Weiß (255) mit N−1 Griffen. Darunter liegt
     das **Histogramm** der Helligkeit; die Flächen zwischen den Griffen sind im Grauwert der jeweiligen
     Stufe eingefärbt. So sieht man sofort, wie viel Bild in jede Stufe fällt.
   - Schalter **„Original zeigen“** (gedrückt halten) zum Vergleich.
   - Knopf **„Gleichmäßig verteilen“** setzt die Griffe zurück.
3. Unten: **JPEG speichern**, **PDF (A4) speichern**, **Drucken**. Export immer in Originalauflösung.
4. Neues Foto: erneut hineinziehen; Einstellungen (Anzahl, Griffe) bleiben erhalten.

### Skizze

```
┌──────────────────────────────────────────────┬──────────────────────────────┐
│                                              │ Graustufen   [−]  5  [+]     │
│                                              │                              │
│                                              │ ▁▂▃▅▇▆▃▂▁▁▂▃ Histogramm       │
│             Vorschau (Ergebnis)              │ ●────●────●────●  Griffe     │
│                                              │ 0                      255   │
│        [Original zeigen – halten]            │ [Gleichmäßig verteilen]      │
│                                              │                              │
│                                              │ Datei: IMG_1234.HEIC         │
│                                              │ 4032 × 3024 · Hochformat     │
├──────────────────────────────────────────────┴──────────────────────────────┤
│  [JPEG speichern]   [PDF A4 speichern]   [Drucken]        Fortschritt ▓▓▓░  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Regeln

- **Maximum 16 Stufen.** Begründung: Ab etwa 16 Stufen ist das Ergebnis visuell kaum noch von einem normalen
  Graustufenbild zu unterscheiden, und 15 Griffe auf einer Leiste sind gerade noch bedienbar (ca. 50 px
  Abstand bei 800 px Breite). Der Wert ist eine Konstante und leicht änderbar.
- **Griffe kreuzen sich nicht:** Griff k darf nur zwischen Griff k−1 + 1 und Griff k+1 − 1 bewegt werden.
- **Anzahl ändern:** Griffe werden gleichmäßig neu verteilt (Standard laut Vorgabe).
- **Live-Vorschau:** Jede Bewegung aktualisiert sofort; Ziel unter 16 ms pro Aktualisierung (siehe Algorithmus).
- **Tastatur:** Griff anklicken, Pfeiltasten ±1, Shift ±10. Zahlenfeld für Anzahl.
- Oberfläche auf Deutsch, Mobil-tauglich (Griffe mit Finger bedienbar, Mindestgröße 44 px Trefferfläche).

### Histogramm – Prüfung und Bewertung

Nutzen: Der Nutzer sieht, wo die Helligkeiten liegen, und kann Griffe gezielt in „Täler“ setzen; damit wird
Posterisierung deutlich besser steuerbar. Kosten: 256 Zähler aus der Vorschau-Helligkeit, einmal pro Bild
(wenige Millisekunden), gezeichnet auf einem kleinen Canvas (ca. 60 Zeilen Code). Darstellung mit
Wurzel-Skalierung der Höhe, damit einzelne Spitzen (z. B. weißer Himmel) das übrige Histogramm nicht plattdrücken.
**Bewertung: lohnt sich, wird umgesetzt (Etappe 5).**

---

## 3. Architektur und Ordnerstruktur

Grundprinzip: **Rechenkern ohne Oberfläche** (reine Funktionen, leicht testbar) getrennt von **Oberfläche**
(DOM) und **Ein-/Ausgabe** (Dateien, Worker, PDF, Druck).

```
graustufen-app/
├── PLAN.md                    ← dieser Plan
├── LIZENZEN.md                ← Lizenzhinweise der Bibliotheken
├── index.html
├── package.json
├── vite.config.ts             ← inkl. vite-plugin-pwa, base-Pfad für GitHub Pages
├── tsconfig.json
├── public/
│   ├── icons/                 ← App-Symbole (192, 512, Apple-Touch-Icon)
│   └── manifest.webmanifest   ← von vite-plugin-pwa erzeugt
├── src/
│   ├── main.ts                ← Verdrahtung: Zustand ↔ Oberfläche ↔ Worker
│   ├── state.ts               ← Zustand: Bild, N, Schwellen, Vorschau-Puffer
│   ├── core/                  ← REINE FUNKTIONEN, kein DOM, 100 % unit-getestet
│   │   ├── luminance.ts       ← RGBA → Helligkeit (Uint8Array)
│   │   ├── thresholds.ts      ← Standardverteilung, Begrenzung, Neuverteilung
│   │   ├── lut.ts             ← Schwellen + N → Nachschlagetabelle (256 Einträge)
│   │   ├── posterize.ts       ← Helligkeit + LUT → RGBA-Ausgabe
│   │   └── histogram.ts       ← Helligkeit → 256 Zähler
│   ├── io/
│   │   ├── validate.ts        ← Typ per Magic Bytes, Größe, Pixelzahl
│   │   ├── decode.ts          ← nativ (createImageBitmap) → sonst heic-to
│   │   ├── exportJpeg.ts
│   │   ├── exportPdf.ts       ← jsPDF, A4, Einpassen
│   │   └── print.ts           ← Druck-Stylesheet + window.print()
│   ├── workers/
│   │   ├── render.worker.ts   ← Vollauflösung: Helligkeit, Posterisieren, JPEG-Kodierung (OffscreenCanvas)
│   │   └── heic.worker.ts     ← heic-to Dekodierung außerhalb des Haupt-Threads
│   ├── ui/
│   │   ├── dropzone.ts
│   │   ├── levelInput.ts      ← Anzahl-Feld
│   │   ├── thresholdSlider.ts ← Mehrgriff-Leiste (Pointer Events) über dem Histogramm
│   │   ├── histogramView.ts
│   │   ├── preview.ts
│   │   └── exportBar.ts
│   ├── styles.css
│   └── print.css
├── tests/
│   ├── unit/                  ← Vitest für src/core und validate
│   ├── e2e/                   ← Playwright (chromium + webkit)
│   └── fixtures/
│       ├── generate.py        ← erzeugt Testbilder reproduzierbar (Pillow + macOS sips)
│       └── *.png/*.jpg/*.heic
└── .github/workflows/
    ├── test.yml               ← Tests bei jedem Push
    └── deploy.yml             ← Build → GitHub Pages
```

### Datenfluss

1. Datei → `validate` (Magic Bytes, Größe) → `decode` → `ImageBitmap` in Originalgröße (Ausrichtung bereits angewendet).
2. Daraus zwei Dinge: (a) **Vorschau-Bitmap**, längste Kante ≈ Bildschirmbreite × Gerätepixel-Faktor, max. 2000 px;
   (b) das Original-Bitmap wird an den `render.worker` übergeben (Transfer, keine Kopie).
3. Vorschau: Helligkeit einmal berechnen (Uint8Array, ca. 2–4 MB), Histogramm einmal berechnen.
4. Jede Regleränderung: neue LUT (256 Werte) → Vorschau neu durchrechnen → Canvas. Kein erneutes Dekodieren.
5. Export: LUT an Worker, Worker rechnet Vollauflösung, kodiert JPEG per `OffscreenCanvas.convertToBlob`,
   gibt Blob zurück → Download / jsPDF / Druck-Bild.

### EXIF-Ausrichtung

Browser wenden die EXIF-Ausrichtung beim Dekodieren per `createImageBitmap` automatisch an
(Standardverhalten `image-orientation: from-image`). Bei HEIC über heic-to wendet libheif die im Container
gespeicherten Dreh-/Spiegelangaben selbst an. Die Ausgabe hat damit immer „aufrechte“ Pixel und braucht kein
EXIF-Tag mehr. Wird in Etappe 2/3 mit Testbildern (Orientierung 6 und 8) ausdrücklich geprüft, weil hier
Browser in der Vergangenheit uneinheitlich waren.

### Sicherheit und Validierung

- Alles läuft lokal im Browser; keine Netzwerkaufrufe außer dem Laden der App-Dateien. Es wird eine strenge
  Content-Security-Policy gesetzt (nur eigene Quelle, kein `connect-src` nach außen), damit das auch
  technisch verhindert ist.
- Dateityp wird **nicht** anhand der Endung oder des gemeldeten MIME-Typs entschieden (Chrome meldet bei HEIC
  oft gar nichts), sondern anhand der ersten Bytes: JPEG `FF D8 FF`, PNG `89 50 4E 47`, HEIC/HEIF `ftyp` mit
  Marke `heic`, `heix`, `hevc`, `mif1`, `msf1`.
- Grenzen: Datei bis 100 MB, Pixelzahl bis 100 MP (abfangbar: 60-MP-Kameras liegen darunter). Darüber klare
  Meldung statt Absturz. Defekte Dateien → verständliche Fehlermeldung, App bleibt benutzbar.
- Speicher: Nur ein Original gleichzeitig; beim Laden eines neuen Fotos werden alte Bitmaps mit `close()`
  freigegeben.

---

## 4. Algorithmus

### 4.1 Helligkeit (Luminanz)

Pro Pixel aus den sRGB-Werten (0–255):

```
Y = round(0.2126·R + 0.7152·G + 0.0722·B)
```

Begründung: Das sind die Gewichte nach **Rec. 709**, deren Farbgrundwerte mit sRGB identisch sind; Grün trägt
am meisten bei, weil das Auge dort am empfindlichsten ist. Die Rechnung erfolgt bewusst auf den gamma-kodierten
Werten (nicht linearisiert), weil Schwellen damit **wahrnehmungsnah** liegen: Gleich große Schritte auf der
Leiste wirken auch gleich groß. Eine Linearisierung würde dunkle Bereiche auf einen winzigen Reglerabschnitt
quetschen. Die ältere Formel Rec. 601 (0.299/0.587/0.114) liefert fast gleiche Ergebnisse; falls gewünscht
umschaltbar, standardmäßig 709. Alpha wird ignoriert (transparente PNG-Bereiche werden vorher auf Weiß gelegt).

### 4.2 Schwellen

- N Stufen → N−1 ganzzahlige Schwellen `t[0] < t[1] < … < t[N−2]`, Werte 1…255.
- **Standardverteilung:** `t[k] = round(256·(k+1)/N)` für k = 0…N−2. Beispiel N=3: 85, 171. N=2: 128.
- **Begrenzung beim Ziehen:** Griff k wird auf `[t[k−1]+1, t[k+1]−1]` begrenzt (Ränder: 1 bzw. 255).
- **Anzahl ändern:** Standardverteilung neu setzen.

### 4.3 Stufenzuordnung und Grauwerte

- Stufe eines Pixels = Anzahl der Schwellen, die ≤ Y sind → Wert 0…N−1.
- Grauwert der Stufe i: `g(i) = round(255·i/(N−1))`. Stufe 0 ist immer Schwarz, Stufe N−1 immer Weiß,
  dazwischen gleichmäßig.
- Umsetzung über **Nachschlagetabelle (LUT)** mit 256 Einträgen: `LUT[Y] = g(Stufe(Y))`. Die LUT wird bei jeder
  Regleränderung neu gebaut (256 Schritte, vernachlässigbar). Das Posterisieren ist dann ein einziger Durchlauf
  `out = LUT[Y[i]]` über die vorberechnete Helligkeit. Für eine 2-MP-Vorschau sind das ca. 2–5 ms, also
  flüssig ohne Worker. Vollauflösung (60 MP) liegt bei ca. 100–300 ms und läuft im Worker.

### 4.4 Histogramm

256 Zähler über die Vorschau-Helligkeit (einmal pro Bild). Anzeige: Höhe ∝ √(Anzahl), Flächen zwischen den
Griffen im Grauwert der jeweiligen Stufe hinterlegt.

---

## 5. Umsetzungsschritte (jede Etappe einzeln prüfbar)

| # | Etappe | Fertig, wenn … |
|---|---|---|
| 0 | **Werkzeuge & Grundgerüst**: Node.js per Homebrew installieren, Vite-Projekt (vanilla-ts) anlegen, Vitest + Playwright einrichten, Git-Repo, GitHub-Repo, Deploy-Workflow nach GitHub Pages, leere Seite „Graustufen-App“ online | Leere Seite ist unter der GitHub-Pages-Adresse erreichbar; `npm test` läuft (0 Tests) |
| 1 | **Rechenkern** (`src/core/*`) als reine Funktionen mit Unit-Tests: Luminanz, Standard-Schwellen, Begrenzung, LUT, Posterisieren, Histogramm | Alle Tests grün; N=2 liefert nur 0/255; N=16 liefert 16 verschiedene Werte; Schwellen immer streng aufsteigend |
| 2 | **Bild laden** (Datei-Dialog + Drag-and-Drop), Validierung per Magic Bytes, Dekodierung JPEG/PNG, Vorschau des Originals, Anzeige von Name/Maßen/Ausrichtung, Fehlermeldungen | Playwright: Gradient-PNG und EXIF-gedrehtes JPEG werden korrekt (aufrecht) angezeigt, defekte Datei zeigt Meldung |
| 3 | **HEIC**: Erkennung „kann der Browser es nativ?“ per Versuch; sonst `heic.worker` mit heic-to | Playwright WebKit: HEIC nativ; Chromium: HEIC über Reserve; beide liefern gleiche Maße |
| 4 | **Live-Posterisierung** mit Anzahl-Feld und vorläufig einfachen Einzel-Reglern | Reglerbewegung aktualisiert Vorschau sichtbar flüssig; Playwright prüft Pixelwerte der Vorschau an bekannten Stellen eines Gradienten |
| 5 | **Mehrgriff-Leiste + Histogramm**: Pointer Events, Nicht-Kreuzen, Tastatur, „Gleichmäßig verteilen“, Histogramm darunter | Griffe lassen sich nicht übereinander ziehen; Tastaturschritte funktionieren; Histogramm passt zum Testgradienten (flach) |
| 6 | **JPEG-Export** in Vollauflösung über `render.worker` (OffscreenCanvas), Fortschrittsanzeige, Dateiname `<Original>_<N>stufen.jpg` | Export eines 60-MP-Test-JPEG hat exakt die Originalmaße; Vorschau bleibt bedienbar während des Exports |
| 7 | **PDF-Export** A4 mit jsPDF: Ausrichtung nach Bildseitenverhältnis, 10 mm Rand, zentriert eingepasst, JPEG ohne Neukodierung eingebettet | PDF hat 1 Seite A4, richtige Ausrichtung, öffnet in Vorschau/PDF Expert; Dateigröße ≈ JPEG-Größe |
| 8 | **Drucken**: `print.css` blendet alles außer dem Vollauflösungs-Bild aus, `@page size: A4 portrait/landscape`, Druck startet erst nach fertigem Vollauflösungs-Render | Druckdialog zeigt genau eine Seite mit eingepasstem Bild (manuell: Druck als PDF über Systemdialog) |
| 9 | **PWA**: Manifest, Symbole, Service Worker (Offline), „Zum Dock hinzufügen“ testen, Content-Security-Policy | App startet aus dem Dock in eigenem Fenster; funktioniert mit abgeschaltetem WLAN |
| 10 | **Feinschliff**: Original-Vergleich (halten), Einstellungen zwischen Fotos behalten, Ladezustände, Barrierefreiheit (Beschriftungen), `LIZENZEN.md`, kurze `README.md` für Bedienung | Manuelle Durchsicht mit echten iPhone-Fotos (Hoch- und Querformat) |
| 11 | **iPhone-Vorbereitung (später, optional)**: Bedienung auf kleinem Bildschirm, „Zum Home-Bildschirm“, Export-Grenzen (siehe Risiko R3) | Smoke-Test auf dem iPhone |

Jede Etappe endet mit einem Git-Commit und einem kurzen Prüfprotokoll (was wurde wie getestet).

---

## 6. Teststrategie

### Automatisierte Tests

**Unit-Tests (Vitest, `tests/unit`)** – nur Rechenkern und Validierung, laufen in unter einer Sekunde:
- Luminanz: reines Rot/Grün/Blau/Weiß/Schwarz ergeben 54/182/18/255/0.
- Standard-Schwellen für N = 2…16: Anzahl N−1, streng aufsteigend, innerhalb 1…255, symmetrisch.
- Begrenzung: Griff kann Nachbarn nicht erreichen oder überholen; Ränder 1/255.
- LUT: monoton steigend; genau N verschiedene Werte; erster 0, letzter 255; N=2 → nur 0 und 255.
- Posterisieren eines künstlichen Gradienten: Stufenwechsel exakt an den Schwellen.
- Histogramm: Summe aller Zähler = Pixelzahl; Gradient 0…255 ergibt flaches Histogramm.
- Validierung: Magic Bytes für JPEG/PNG/HEIC; falsche Endung mit richtigem Inhalt wird akzeptiert; richtige
  Endung mit falschem Inhalt wird abgelehnt; zu große Datei wird abgelehnt.

**Browser-Tests (Playwright, `tests/e2e`, Chromium und WebKit)**:
- Gradient-PNG laden → Pixelwerte der Vorschau an 5 bekannten Positionen prüfen.
- JPEG mit EXIF-Orientierung 6 (90° gedreht) → angezeigte Breite/Höhe vertauscht gegenüber Rohdaten.
- HEIC (Hochformat) in WebKit nativ und in Chromium über Reserve → gleiche Maße, aufrecht.
- Anzahl ändern 2 → 5 → 16 → 2: Anzahl Griffe stimmt, Griffe gleichmäßig verteilt.
- Griff per Tastatur gegen Nachbarn schieben → stoppt eine Einheit davor.
- JPEG-Export: heruntergeladene Datei hat Originalmaße.
- PDF-Export: Datei beginnt mit `%PDF`, hat eine Seite, Seitenmaße A4 in passender Ausrichtung.
- Defekte Datei (abgeschnittenes JPEG) → Fehlermeldung sichtbar, App weiterhin bedienbar.
- Großes Bild (60 MP) → Export dauert < 10 s, keine Fehlermeldung.

### Testbilder (`tests/fixtures/generate.py`, reproduzierbar erzeugt)

| Datei | Zweck |
|---|---|
| `gradient-256.png` | 256×64 Grauverlauf 0…255 für exakte Pixelprüfungen |
| `color-patches.png` | Reine Grundfarben für Luminanz-Prüfung |
| `portrait-exif6.jpg`, `landscape-exif8.jpg` | EXIF-Ausrichtung (mit Pillow geschrieben) |
| `huge-9000x6700.jpg` | 60 MP, Leistung und Speicher |
| `small-16x16.png` | Randfall sehr klein |
| `transparent.png` | Alpha-Umgang |
| `truncated.jpg`, `fake.heic` (eigentlich Text) | Defekt bzw. falsche Endung |
| `sample-portrait.heic`, `sample-landscape.heic` | Mit macOS-Bordmittel `sips -s format heic` aus PNG erzeugt |
| 2–3 echte iPhone-Fotos | Vom Nutzer bereitgestellt (Hoch-/Querformat, ggf. HDR). Bleiben lokal, nicht ins Repo |

### Manuelle Prüfungen (Checkliste je Freigabe)

1. Echtes iPhone-HEIC im Hochformat in Safari laden → aufrecht, flüssige Regler.
2. Gleiches Foto in Chrome → Reserve-Weg, Wartezeit akzeptabel (einige Sekunden bei 48 MP), Ergebnis identisch.
3. 2 Stufen und 16 Stufen: Ergebnis plausibel, alle Griffe greifbar.
4. PDF in Vorschau/PDF Expert öffnen und auf Papier drucken: Rand und Ausrichtung stimmen.
5. Druckdialog direkt aus der App: eine Seite, keine abgeschnittenen Ränder; Kopf-/Fußzeilen des Browsers
   im Dialog abschalten (einmalig).
6. „Zum Dock hinzufügen“, WLAN aus, App starten, Foto verarbeiten.

---

## 7. Risiken und offene Fragen

| # | Risiko | Einschätzung | Gegenmaßnahme |
|---|---|---|---|
| R1 | HEIC-Reserve (heic-to) in Chrome ist langsam und speicherhungrig: 48 MP ≈ 200 MB RGBA, mehrere Sekunden | Mittel; betrifft nur Nicht-Safari | Worker, Fortschrittsanzeige, Hinweis „In Safari schneller“. Safari ist der Hauptweg |
| R2 | Uneinheitliche EXIF-Ausrichtung zwischen Browsern oder im libheif-Pfad | Niedrig bis mittel | Gezielte Tests mit Orientierung 6/8 in beiden Engines (Etappe 2/3); bei Bedarf eigene Drehung per Canvas |
| R3 | **iPhone-Export in Vollauflösung**: Safari auf iOS begrenzt ein Canvas auf ca. 16,7 Mio. Pixel; ein 48-MP-Foto passt nicht in ein Canvas | Hoch für Etappe 11, irrelevant für den Mac | Beim iPhone-Ausbau: streifenweise rechnen und JPEG mit JavaScript-/WASM-Encoder zusammensetzen (Bibliothek dann prüfen), oder Export auf dem iPhone auf 16 MP begrenzen und das klar anzeigen |
| R4 | Speicherbedarf bei 60 MP auf dem Mac (RGBA 240 MB + Helligkeit 60 MB) | Niedrig | Nur ein Bild gleichzeitig, Bitmaps freigeben, Pixelgrenze 100 MP |
| R5 | Druckdialog: Browser fügen Kopf-/Fußzeilen und Ränder hinzu | Mittel (Bedienkomfort) | `@page`-Regeln, Hinweis im Dialog; Alternative: PDF speichern und daraus drucken |
| R6 | HDR-HEIC neuerer iPhones (10 Bit, Gain Map) | Niedrig | Browser liefern tonemapped 8 Bit; wird mit echtem Foto geprüft |
| R7 | LGPL-3.0 bei heic-to | Niedrig (private Nutzung, unveränderte Bibliothek) | Lizenzhinweise mitliefern |
| R8 | GitHub Pages: Code ist öffentlich | Vom Nutzer akzeptiert | Keine Fotos oder persönlichen Daten im Repo; echte Testfotos bleiben lokal |
| R9 | `sips`-erzeugte HEIC-Dateien unterscheiden sich intern von iPhone-Dateien (Kachelung) | Mittel | Zusätzlich echte iPhone-Fotos manuell testen |
| R10 | Dock-Web-App von Safari: Verhalten bei Dateidialog/Download im eigenen Fenster | Niedrig | In Etappe 9 prüfen; Downloads landen im Ordner „Downloads“ |

### Offene Fragen (mit vorgeschlagenen Standardwerten, falls keine Antwort)

1. JPEG-Qualität beim Export: Vorschlag fest **92 %** (kaum sichtbare Verluste, moderate Dateigröße).
2. Dateinamen: Vorschlag `<Originalname>_<N>stufen.jpg` bzw. `.pdf`.
3. Soll beim Ändern der Stufenanzahl wahlweise die bisherige Verteilung proportional erhalten bleiben?
   Vorschlag: zunächst nein (immer gleichmäßig, wie vorgegeben), später als Option möglich.
4. Dunkelmodus der Oberfläche: Vorschlag folgt der Systemeinstellung, neutraler Grauton, damit die
   Bildbeurteilung nicht verfälscht wird.
5. Name der App und des GitHub-Repos: Vorschlag „Graustufen“ / `graustufen-app`.
6. GitHub-Konto: Existiert eines oder soll in Etappe 0 eines angelegt werden?

---

## Verifikation des Gesamtergebnisses

Nach Etappe 10 gilt die App als fertig für den Mac, wenn: `npm test` (Vitest) und `npx playwright test`
(Chromium + WebKit) grün sind, die GitHub-Pages-Adresse die aktuelle Version liefert, die manuelle Checkliste
aus Abschnitt 6 vollständig abgehakt ist und ein echtes iPhone-HEIC im Hochformat als JPEG, PDF und Ausdruck
korrekt herauskommt.

---

## Umsetzungsstand (25.10.2026)

| Etappe | Stand |
|---|---|
| 0 Gerüst | Erledigt, außer GitHub-Repo und Veröffentlichung (GitHub-CLI nicht installiert, Konto offen). Workflows `test.yml` und `deploy.yml` liegen bereit. |
| 1 Rechenkern | Erledigt, 10 Unit-Tests |
| 2 Bild laden | Erledigt (Datei-Dialog, Drag-and-Drop, Prüfung per Magic Bytes, Erkennung abgeschnittener JPEG/PNG) |
| 3 HEIC | Erledigt: WebKit nativ, Chromium über heic-to (CSP-Variante, auf dem Hauptthread statt eigenem Worker) |
| 4 bis 5 Live-Vorschau, Mehrgriff-Leiste, Histogramm | Erledigt (Maus und Tastatur getestet) |
| 6 bis 7 JPEG- und PDF-Export | Erledigt, Vollauflösung über Worker, auch 60 Megapixel in beiden Browsern |
| 8 Drucken | Umgesetzt (Druckbereich mit exakter A4-Größe), Druckdialog nur manuell prüfbar |
| 9 PWA | Erledigt: Manifest, Symbole, Service Worker, Offline-Test in Chromium und WebKit, strenge CSP |
| 10 Feinschliff | README, LIZENZEN, Vergleichstaste erledigt; Prüfung mit echten iPhone-Fotos steht aus |
| 11 iPhone-Vorbereitung | Technisch vorbereitet, echter iPhone-Test steht aus (siehe unten) |

Abweichung vom Plan: Die HEIC-Reserve läuft nicht in einem eigenen Worker. Messung: 400×300-Testbild unter 1 s.
Mit einem echten 48-Megapixel-HEIC in Chrome noch prüfen (Risiko R1).

### Etappe 11: iPhone (Stand 25.10.2026)

Umgesetzt:
- **Export ohne großes Canvas (löst Risiko R3):** Der Worker verarbeitet das Foto in Streifen von höchstens 4 Megapixel. Ein eigener, abhängigkeitsfreier Graustufen-JPEG-Encoder (`src/core/jpegGray.ts`) schreibt die Streifen direkt in die Datei. Die iOS-Grenze von ca. 16,7 Megapixel pro Canvas wird nie berührt. Dieser Weg gilt auf allen Geräten, ist also auch am Mac getestet (60 Megapixel in Chromium und WebKit).
- **Encoder geprüft:** Unit-Tests für Aufbau und Tabellen, unabhängige Gegenprobe mit dem Pillow-Dekoder (glatte Flächen exakt, Rauschen im üblichen JPEG-Rahmen), im Browser dekodiert und auf Werte geprüft. Ausgabe ist ein echtes Graustufen-JPEG (1 Komponente), das PDF bettet es als DeviceGray ein.
- **Weniger Arbeitsspeicher:** Das Original wird an den Worker übergeben statt kopiert (vorher doppelt im Speicher).
- **Fortschrittsanzeige** in Prozent beim Export.
- **Sichern in zwei Schritten auf Touch-Geräten:** Nach der Berechnung erscheint eine Schaltfläche „Fertig: … sichern oder teilen“, die das Teilen-Menü von iOS öffnet (Bild sichern, In Dateien sichern, AirDrop). Grund: Safari erlaubt das Teilen nur direkt nach einer Berührung, nicht nach langer Rechenzeit. Ohne Teilen-Menü bleibt der normale Download.
- **Touch-Bedienung:** Griffe sitzen auf Touch-Geräten abwechselnd in zwei Reihen und sind mindestens 44 Punkte hoch, auch bei 16 Stufen ohne Überlappung. Seitenleiste unter dem Bild, Sicherheitsbereiche (Notch, Home-Balken) berücksichtigt, Meta-Angaben für „Zum Home-Bildschirm“.
- **Tests:** iPhone-15-Profil in WebKit (Layout, Überlappung, Teilen-Ablauf mit nachgebildetem Teilen-Menü).

Noch nicht geprüft (nur auf einem echten iPhone möglich):
1. Ob Safari auf dem iPhone ein 48-Megapixel-HEIC ohne Speicherabbruch dekodiert (Grenze hängt vom Modell ab).
2. Ob das Teilen-Menü mit der erzeugten Datei sauber öffnet.
3. Gefühl und Genauigkeit beim Ziehen der Griffe mit dem Finger (simuliert wurde nur Tippen und Layout).
4. Verhalten als „Zum Home-Bildschirm“-App (Dateiauswahl, Offline-Start).
5. Drucken über AirPrint.

---

## Etappe 12: Bereiche mit eigenen Einstellungen (Wunsch vom 25.10.2026)

**Anlass:** Bei einem Portrait vor Wolkenhimmel passt eine einzige Einstellung nicht. Stellt man die Schwellen
für das Gesicht ein, wird der Himmel zu einer glatten Fläche. Gewünscht: unterschiedliche Schwellen in
unterschiedlichen Bildbereichen.

**Bedienung**
- Oben in der Bedienleiste stehen Reiter: **Ganzes Bild**, **Bereich 1** bis **Bereich 3**, **+ Bereich**.
- Der gewählte Reiter bestimmt, welche Einstellungen Stufenzahl, Griffe und Histogramm gerade zeigen.
- Bei einem Bereich erscheinen Malwerkzeuge: **Pinsel**, **Radierer**, **Pinselgröße**, **Maske zeigen**, **Bereich löschen**.
- Man malt mit Finger oder Maus direkt ins Bild. Der bemalte Bereich wird orange hervorgehoben (abschaltbar).
- Das Histogramm zeigt nur die Helligkeiten des gewählten Bereichs. Beim Himmel sieht man also genau die Wolkentöne.
- Beim Reiter „Ganzes Bild“ zeigt es die Pixel, die zu keinem Bereich gehören.
- Ein neues Foto entfernt die Bereiche. Die Einstellung für das ganze Bild bleibt erhalten.

**Rechenweg**
- Jeder Bereich hat eine Maske in Vorschau-Auflösung (Werte 0 bis 255) und eine eigene Nachschlagetabelle.
- Pro Pixel: zuerst der Grauwert der Grundeinstellung, dann wird jeder Bereich gemäß seiner Maske darübergelegt.
  `g = g + (LUT_Bereich[Y] − g) · Maske/255`, Bereiche in Reihenfolge.
- Der Pinsel hat einen weichen Rand. Dadurch gibt es am Übergang wenige Pixel mit Zwischen-Grautönen statt einer harten Kante.
- Export in Originalauflösung: Der Worker vergrößert die Masken streifenweise bilinear auf die volle Größe.
  Der Streifen-Export und die iOS-Grenzen bleiben unverändert.

**Tests**
- Unit: Überlagerung (Maske 0, 128, 255), Pinselstempel und Radierer, bilineare Maskenvergrößerung, gewichtetes Histogramm.
- Browser: Bereich anlegen, eine Bildhälfte bemalen, eigene Stufen einstellen. Geprüft werden die Pixel in Vorschau
  und Export, auch bei einem Bild größer als die Vorschau (Masken werden dann vergrößert).

**Stand 25.10.2026:** Umgesetzt und getestet. 30 Unit-Tests und 43 Browser-Tests sind grün, in Chromium, WebKit und
im iPhone-Profil. Gefundener und behobener Fehler: Die Reiterleiste schrumpfte bei voller Seitenleiste auf
Höhe null, und die Malwerkzeuge fingen die Klicks ab. Auf echtem iPhone noch zu prüfen: Malen mit dem Finger
(Genauigkeit, kein ungewolltes Scrollen) und die Rechenzeit beim Export mit drei Bereichen bei 48 Megapixel.
