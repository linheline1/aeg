import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@aeg/web-shared': fileURLToPath(new URL('../../packages/web-shared/src', import.meta.url)) } },
  server: {
    proxy: {
      '/api': {
        // 联调远端后端时用 API_PROXY_TARGET 覆盖，如 http://192.168.1.140:5000
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:5000',
        changeOrigin: true
      }
    }
  }
});
