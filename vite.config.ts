
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve('src'),
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    },
    build: {
      outDir: 'dist', 
      sourcemap: false,
      // QUAN TRỌNG: Hạ target xuống es2015 để chạy được trên iOS cũ/Safari
      target: 'es2015',
      cssTarget: 'chrome61', // Ngăn chặn lỗi CSS trên các trình duyệt cũ
    }
  }
})
