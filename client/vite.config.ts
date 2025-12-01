import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  
  // --- ¡ESTA ES LA LÍNEA MÁGICA! ---
  // Le dice a Vite que use rutas relativas (./)
  // para que funcione dentro de Electron
  base: './',

  plugins: [
    react(),
  ],
})