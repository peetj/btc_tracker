/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(() => {
  const pagesBasePath = '/btc_tracker/'
  const isGithubPagesBuild = process.env.GITHUB_ACTIONS === 'true'
  const appBasePath = isGithubPagesBuild ? pagesBasePath : '/'

  return {
    base: appBasePath,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'manifest.json'
        ],
        manifest: {
          name: 'Bitcoin Price Tracker',
          short_name: 'BTC Tracker',
          description: 'Historical Bitcoin price tracking from 2012',
          start_url: appBasePath,
          scope: appBasePath,
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
          globIgnores: ['**/data/**'],
          runtimeCaching: [
            {
              urlPattern: /\/data\/.*\.csv$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'btc-data-cache',
                expiration: {
                  maxEntries: 1,
                  maxAgeSeconds: 86400
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: false
        }
      })
    ],
    publicDir: 'public',
    build: {
      rollupOptions: {
        input: {
          main: './index.html',
        }
      }
    }
  }
})
