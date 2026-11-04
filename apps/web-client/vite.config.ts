import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@aeg/web-shared': fileURLToPath(new URL('../../packages/web-shared/src', import.meta.url)) } },
  server: { proxy: { '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true } } }
});
