import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  build: {
    // По умолчанию Vite кладёт бандл в /assets/..., но этот префикс на
    // сервере занят иконками каталога (/assets/<мод>/graphics/...,
    // см. app/main.py и Caddyfile) — отдельная папка исключает коллизию.
    assetsDir: 'static',
  },
})
