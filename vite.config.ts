import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/breathing-index/',
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Breathing Index',
        short_name: 'Breathing',
        description:
          'A personal air index that learns your triggers from your own symptom diary and predicts your day on a four-level scale, from 1 (Excellent) to 4 (Dangerous).',
        theme_color: '#1f4e8c',
        background_color: '#fafafa',
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
        ],
      },
    }),
  ],
})
