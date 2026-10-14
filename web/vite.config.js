import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API runs as its own compose service; in the sandbox the web app is the
// single public origin and proxies /api and /uploads to it.
const apiTarget = process.env.API_URL || 'http://localhost:8000';

// An .apk is a zip inside, so a phone that is not told otherwise saves the download
// as a .zip instead of installing it. Vite has no mime type for .apk, so name it and
// mark it as an attachment. The files are build output (see AGENTS.md).
function apkDownloadHeaders() {
  return {
    name: 'apk-download-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = (req.url || '').split('?')[0];
        if (file.startsWith('/downloads/') && file.endsWith('.apk')) {
          res.setHeader('Content-Type', 'application/vnd.android.package-archive');
          res.setHeader('Content-Disposition', `attachment; filename="${file.split('/').pop()}"`);
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), apkDownloadHeaders()],
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
