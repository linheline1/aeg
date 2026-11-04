import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  plugins: [react()],
  resolve: { alias: { '@aeg/web-shared': fileURLToPath(new URL('../../packages/web-shared/src', import.meta.url)) } },
  server: {
    port: 5175,
    proxy: {
      '/api': { target: process.env.API_TARGET || 'http://127.0.0.1:5000', changeOrigin: true }
    }
  }
});
