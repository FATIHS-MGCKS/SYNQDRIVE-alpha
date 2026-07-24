import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@synq/evaluations-insights': path.resolve(__dirname, '../shared/evaluations-insights'),
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
  },
})
