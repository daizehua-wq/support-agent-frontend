import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/internal/channels/reload': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        headers: {
          'X-Internal-Call': 'true',
        },
      },
      '/internal/channels/loaded': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        headers: {
          'X-Internal-Call': 'true',
        },
      },
      '/internal/management': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        headers: {
          'X-Internal-Call': 'true',
        },
      },
      '/internal': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        headers: {
          'X-Internal-Call': 'true',
        },
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
