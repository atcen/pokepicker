import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['sql.js'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
