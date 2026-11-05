import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/') && !id.includes('/examples/')) return 'three';
        },
      },
    },
  },
});
