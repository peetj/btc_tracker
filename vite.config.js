import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'data/btcusd_1-min_data.csv',
          dest: 'data'
        }
      ]
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'manifest.json' // 👈 add this
      ],
      manifest: {
        name: 'Bitcoin Price Tracker',
        short_name: 'BTC Tracker',
        description: 'Historical Bitcoin price tracking from 2012',
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
        // Exclude large CSV files from service worker caching
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        globIgnores: ['**/data/**'],
        runtimeCaching: [
          {
            // Cache the CSV data file separately with network-first strategy
            urlPattern: /\/data\/.*\.csv$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'btc-data-cache',
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 86400 // 1 day cache
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
  // Copy data folder to the build output
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
      }
    }
  }
})