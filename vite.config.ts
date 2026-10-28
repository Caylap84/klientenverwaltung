import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration is injected only into production builds; guarded for
      // environments without service workers (file://, some webviews).
      injectRegister: 'inline',
      includeAssets: ['favicon.svg'],
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
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
