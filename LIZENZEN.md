# Lizenzhinweise

Der eigene App-Code steht unter der MIT-Lizenz. Die App enthält folgende Bibliotheken:

| Bibliothek | Version | Lizenz | Zweck |
|---|---|---|---|
| heic-to (enthält libheif als WebAssembly) | 1.6.6 | LGPL-3.0 | HEIC-Reservedekoder für Browser ohne eigene HEIC-Unterstützung |
| jsPDF | 4.2.1 | MIT | PDF-Export |
| vite, vite-plugin-pwa, vitest | 8.3.5 / 2.0.0 / 5.0.5 | MIT | Entwicklung und Tests (nicht in der App) |
| @playwright/test | 1.64.1 | Apache-2.0 | Browser-Tests (nicht in der App) |

heic-to und libheif werden unverändert als eigenständiger Programmteil mitgeliefert. Der Quellcode steht unter
https://github.com/hoppergee/heic-to bzw. https://github.com/strukturag/libheif zur Verfügung.
Den vollständigen Lizenztext der LGPL-3.0 finden Sie unter `node_modules/heic-to/LICENSE`.
