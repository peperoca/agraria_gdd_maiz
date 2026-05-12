import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    proxy: {
      '/gdd-api': {
        target: 'https://www.valleychaco.com.py',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.svg'],
      manifest: {
        name: 'Corn GDD Tracker',
        short_name: 'GDD Tracker',
        description: 'Track Growing Degree Days for corn fields using your weather station',
        theme_color: '#185FA5',
        background_color: '#f2f1ec',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/icons/icon-192.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
          {
            src: '/icons/icon-192.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/gdd-api\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
})
