import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@vo/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    watch: {
      // garante que o Vite observa mudanças no pacote shared (fora do root do client)
      ignored: ['!**/shared/src/**'],
    },
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
  optimizeDeps: {
    // força o Vite a não pré-bakelar o shared como dependência externa
    exclude: ['@vo/shared'],
  },
});
