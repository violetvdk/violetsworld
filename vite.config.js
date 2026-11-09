import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './', // werkt op GitHub Pages (violetvdk.github.io/violetsworld/)
  plugins: [react()],
})
