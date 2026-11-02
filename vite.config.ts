import { defineConfig } from 'vite';
import { resumePlugin } from './plugins/resume.ts';

export default defineConfig({
  // Relative base so the static build works on GitHub Pages project sites as well as at a domain root.
  base: './',
  plugins: [resumePlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,
  },
});
