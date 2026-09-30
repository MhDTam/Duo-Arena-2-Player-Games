import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  envDir: path.resolve(here, '..'),
  base: './',
  build: { outDir: path.resolve(here, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    host: true,
    port: 5173,
    fs: { allow: [path.resolve(here, '..')] },
    proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } },
  },
});
