import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths so the built game also runs straight from file://
  base: './',
  build: { assetsInlineLimit: 1024 * 1024 }, // inline the logo so file:// has no CORS issues
  // dedicated port: other Taronga apps already sit on 5173-5180, and without strictPort
  // Vite silently drifts to the next free one and you end up opening the wrong app
  server: { port: 5190, strictPort: true, host: true },
});
