
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './'),
        },
      },
      define: {
        'process.env': {}, // Polyfill process.env to avoid ReferenceError
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''), // Safe fallback to empty string
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || '')
      }
    };
});
