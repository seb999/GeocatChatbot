import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: proxy /api → backend (Express on :8080). Prod: same-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
