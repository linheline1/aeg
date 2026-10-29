import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 部署路径前缀（VPS：BASE_PATH=/ops/），本地开发默认 /
const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true } } }
});
