/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The dev server proxies /api to the Express API so the browser sees one origin.
// That keeps session and CSRF cookies first-party (SameSite=Lax) without loosening CORS.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: env.VITE_API_PROXY_TARGET ?? 'http://localhost:5000', changeOrigin: false },
      },
    },
    build: { sourcemap: false },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['tests/specs/**/*.{ts,tsx}'],
      setupFiles: ['tests/setupTests.ts'],
      css: false,
    },
  };
});
