/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// 開発サーバーの /api プロキシ先。API_PROXY_TARGET でテスト用ポートへ切り替え可能。
const DEFAULT_PROXY_TARGET = 'http://127.0.0.1:7071';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.API_PROXY_TARGET || DEFAULT_PROXY_TARGET;

  return {
    plugins: [react()],
    server: {
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 3000,
    },
    build: {
      // Azure Static Web Apps workflow の output_location に合わせる
      outDir: 'build',
      emptyOutDir: true,
      sourcemap: false,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
