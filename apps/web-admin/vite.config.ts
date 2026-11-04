import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 子域名部署与本地开发均使用根路径；如需路径托管再设置 BASE_PATH
const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.API_TARGET || 'http://127.0.0.1:5000',
        changeOrigin: true
      }
    }
  }
});
