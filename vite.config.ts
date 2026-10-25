import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SHARED_MODE': JSON.stringify(
      process.env.VITE_SHARED_MODE ?? (process.env.CF_PAGES_BRANCH?.startsWith('feature/') ? 'true' : 'false'),
    ),
  },
});
