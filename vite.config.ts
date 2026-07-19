import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: ['lyw9i1-ip-152-231-143-14.tunnelmole.net'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})