import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8765',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/node_modules/recharts/')) return 'recharts'
          if (id.includes('/node_modules/@tanstack/')) return 'tanstack'
          if (id.includes('/node_modules/lucide-react/')) return 'icons'
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-is/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'react'
          }
          return 'vendor'
        },
      },
    },
  },
})
