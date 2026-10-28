import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发态把 /api 代理到后端，前端与后端同源，省掉一层 CORS。
// 后端端口从环境变量读，与 server/src/config.js 的 PORT 对应。
const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
});
