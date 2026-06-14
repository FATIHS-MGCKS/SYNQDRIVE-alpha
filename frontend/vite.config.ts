import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
    // Source maps ship only when explicitly requested (VITE_SOURCEMAP=true),
    // keeping the production bundle/output small by default.
    sourcemap: process.env.VITE_SOURCEMAP === 'true',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Split heavy vendor libraries into long-term-cacheable chunks so a code
        // change in the app doesn't force users to re-download mapbox/recharts/etc.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('mapbox-gl')) return 'vendor-mapbox';
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory')) {
            return 'vendor-charts';
          }
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/react/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }
          return 'vendor';
        },
      },
    },
  },
})
