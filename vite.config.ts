import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Offline support: the app shell, the sample interviews and the fonts are cached,
    // so importing, coding your sample, the laptop reader and access copies all work with Wi-Fi off.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'sample/interviews.json'],
      manifest: {
        name: 'QualPair',
        short_name: 'QualPair',
        description: 'Code qualitative interviews with a laptop reader, a cloud reader and you as the yardstick.',
        theme_color: '#1d2422',
        background_color: '#f3f1ec',
        display: 'standalone',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json}'],
        // The finished example (2 MB) is fetched only when someone opens it; it then lives in IndexedDB.
        globIgnores: ['sample/finished.json'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.googleapis\.com\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'fonts-css' } },
          { urlPattern: /^https:\/\/fonts\.gstatic\.com\//, handler: 'CacheFirst', options: { cacheName: 'fonts', expiration: { maxEntries: 30, maxAgeSeconds: 31536000 } } },
        ],
      },
    }),
  ],
});
