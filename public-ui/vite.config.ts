import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), wasm()],
  worker: {
    // Web Workers also need the wasm plugin
    plugins: () => [wasm()],
  },
  server: {
    fs: {
      // Allow serving files from the monorepo root (one level up from public-ui).
      // Needed so the dev server can serve pkg-wasm/actuator_wasm_bg.wasm which
      // the wasm-pack generated init() fetches at runtime via @fs/.
      allow: ['..'],
    },
  },
})
