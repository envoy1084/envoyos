// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";

import cloudflare from "@astrojs/cloudflare";

import mdx from "@astrojs/mdx";

import sitemap from "@astrojs/sitemap";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
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
