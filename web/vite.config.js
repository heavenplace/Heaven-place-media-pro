import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API runs as its own compose service; in the sandbox the web app is the
// single public origin and proxies /api and /uploads to it.
const apiTarget = process.env.API_URL || 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/uploads': { target: apiTarget, changeOrigin: true }
    }
  }
});
