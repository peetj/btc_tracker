import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'manifest.json' // 👈 add this
      ],
      manifest: {
        name: 'Bitcoin Price Tracker',
        short_name: 'BTC Tracker',
        description: 'Real-time Bitcoin price tracking',
        theme_color: '#f59e0b',
        background_color: '#1f2937',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.coindesk\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'bitcoin-api-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 // 1 minute cache
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
})