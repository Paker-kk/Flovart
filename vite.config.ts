import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tauri 期望固定端口，开发时失败则退出而非随机换端口
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // 打包后使用相对路径，确保 Tauri 本地文件协议正常加载
      base: './',
      server: {
        port: 3000,
        host: host || '0.0.0.0',
        strictPort: true,
      },
      plugins: [tailwindcss(), react()],
      // 排除独立 HTML 文件，避免 esbuild 扫描其内联脚本报错
      optimizeDeps: {
        entries: ['index.html'],
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom'],
              'vendor-genai': ['@google/genai'],
              'vendor-tiptap': ['@tiptap/core', '@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-mention', '@tiptap/suggestion'],
            },
          },
        },
      },
      test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./tests/setup.ts'],
      },
    };
});
