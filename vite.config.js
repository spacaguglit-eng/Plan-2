import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@tanstack/react-query'],
  }, // Важно для Electron - относительные пути
  server: {
    port: 3000,
    host: true, // true = 0.0.0.0 — доступ по локальной сети для нескольких пользователей
    open: false,
    /** Повторный запуск dev не занимает 3001 молча — порт занят = ошибка, без второго Vite. */
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: 3000,
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

