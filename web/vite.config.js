import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // expose on LAN so you can test on the iPhones / iPad
    port: 5173,
    allowedHosts: true,
    proxy: {
      // Same-origin calls to the gateway — no CORS headaches in the browser.
      '/api': { target: 'http://localhost:5001', changeOrigin: true },
    },
  },
});
