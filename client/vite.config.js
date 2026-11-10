import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development, /api and the Socket.IO endpoint are proxied to the Express server, so no CORS setup is needed.
const target = process.env.API_PROXY_TARGET || 'http://localhost:5000';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': target,
      '/socket.io': { target, ws: true },
    },
  },
  test: { environment: 'node' },
});
