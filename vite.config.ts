import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/content/main.tsx',
      output: {
        entryFileNames: 'content.js',
        assetFileNames: 'content.[ext]',
      },
    },
  },
});
