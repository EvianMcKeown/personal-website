// vite.config.ts
import { defineConfig } from "vite"
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: "/personal-website/", // for GitHub Pages
  plugins: [
    tailwindcss(),
  ],
});
