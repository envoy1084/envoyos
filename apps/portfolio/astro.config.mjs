import cloudflare from "@astrojs/cloudflare";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [react(), mdx(), sitemap()],
  adapter: cloudflare(),
  server: {
    port: 3000,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
