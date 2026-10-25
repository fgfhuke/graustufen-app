import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  worker: { format: 'es' },
  test: { include: ['tests/unit/**/*.test.ts'] },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      filename: 'sw.js',
      injectRegister: false,
      manifest: {
        name: 'Graustufen',
        short_name: 'Graustufen',
        lang: 'de',
        display: 'standalone',
        background_color: '#2b2b2b',
        theme_color: '#2b2b2b',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,wasm,png,webmanifest}'], maximumFileSizeToCacheInBytes: 8 * 1024 * 1024 },
    }),
  ],
});
