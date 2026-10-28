import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // Registration happens in src/pwa/registerPwa.ts (production only);
      // updates are user-initiated via UpdateBanner.
      injectRegister: false,
      manifest: {
        name: 'Klientenverwaltung',
        short_name: 'Klienten',
        description:
          'Klientenverwaltung für Stimmtraining: Klienten, Termine und Notizen lokal und offline verwalten.',
        lang: 'de',
        display: 'standalone',
        start_url: './',
        scope: './',
        theme_color: '#2f5fd0',
        background_color: '#f6f7f9',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The plugin adds the manifest and its icons to the precache itself,
        // so png/webmanifest are left out here to avoid duplicate entries.
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
