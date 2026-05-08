import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tauri 期望固定端口，开发时失败则退出而非随机换端口
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => {
    return {
      // Cloudflare Pages 使用绝对路径，Tauri 使用相对路径
      base: process.env.CF_PAGES ? '/' : './',
      server: {
        port: 11451,
        host: host || '0.0.0.0',
        strictPort: true,
      },
      plugins: [tailwindcss(), react()],
      // 排除独立 HTML 文件，避免 esbuild 扫描其内联脚本报错
      optimizeDeps: {
        entries: ['index.html'],
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
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
      },
    };
});
