import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      // busy-lib is bundled, so a release needs no node_modules at all.
      externalizeDeps: false,
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          // Each run on this computer gets its own worker thread from this file.
          'host-worker': resolve('src/main/host-worker.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      // A sandboxed preload must be CommonJS.
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    resolve: {
      alias: { '@': resolve('src/renderer/src') },
    },
    plugins: [react(), tailwindcss()],
    // Honors a PORT handed out by Portless; otherwise Vite picks a free one.
    server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : {},
  },
})
