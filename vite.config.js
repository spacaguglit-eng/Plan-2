import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    dedupe: ['@tanstack/react-query'],
  },
  optimizeDeps: {
    include: ['@tanstack/react-query'],
  }, // Важно для Electron - относительные пути
  server: {
    port: 3000,
    host: true, // true = 0.0.0.0 — доступ по локальной сети для нескольких пользователей
    open: false,
    strictPort: false,
    hmr: {
      clientPort: 3000,
      host: 'localhost', // HMR с этой машины; при доступе по сети перезагрузка страницы обновит код
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
})

