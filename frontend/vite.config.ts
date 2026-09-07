import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5150,
    proxy: {
      // En dev, on évite de coder l'URL du backend en dur dans le code :
      // le frontend appelle /api/... et Vite relaie vers le backend.
      '/api': {
        target: process.env.VITE_DEV_API_PROXY || 'http://localhost:5151',
        changeOrigin: true,
      },
    },
  },
})
