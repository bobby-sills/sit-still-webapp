import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The vision models are large binaries fetched into public/ ahead of time;
  // Vite serves them verbatim, so nothing about a session needs the network.
  build: { target: 'es2022' },
})
