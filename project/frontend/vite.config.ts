import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'https://schoolmgtsystem-gsru.onrender.com';

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      // Dev only: the SPA runs on :5173 and the Django API on :8000. Proxying
      // /api and /media keeps requests same-origin (no CORS) and lets the app
      // use a relative "/api" base URL. In production the two are deployed to
      // separate servers, so set VITE_API_BASE_URL to the API's real URL — these
      // proxy rules apply solely to `vite dev`, never to the built bundle.
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/media': { target: proxyTarget, changeOrigin: true },
      },
    },
  };
});
