import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": "http://localhost:5175",
      "/admin": "http://localhost:5175",
    },
    allowedHosts: [
      "flow.trace.market",
      "www.flow.trace.market",
      "localhost",
      "127.0.0.1",
    ],
  },
})
