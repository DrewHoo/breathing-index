import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Breathing Index',
        short_name: 'Breathing',
        description:
          'A personal air index that learns your triggers from your own symptom diary and predicts your day on a four-level scale, from 1 (Easy) to 4 (Dangerous).',
        theme_color: '#F3F6F7',
        background_color: '#F3F6F7',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(air-quality-api|api)\.open-meteo\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'open-meteo',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 24, maxAgeSeconds: 6 * 3600 },
            },
          },
          {
            // Place names for a given coordinate essentially never change, so
            // this one is cache-first — it keeps the header named when offline.
            urlPattern: /^https:\/\/api\.bigdatacloud\.net\/data\/reverse-geocode-client.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'reverse-geocode',
              expiration: { maxEntries: 16, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
