import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // Важно для Electron - относительные пути
  server: {
    port: 3000,
    host: '127.0.0.1', // Используем IP вместо localhost для лучшей совместимости с VPN
    open: false, // Отключаем автоматическое открытие браузера
    strictPort: false, // Позволяет использовать другой порт, если 3000 занят
    hmr: {
      clientPort: 3000 // Порт для Hot Module Replacement
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

