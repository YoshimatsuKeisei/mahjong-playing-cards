import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Mahjong Playing Cards",
        short_name: "Card Mahjong",
        description: "Online mahjong-like playing card game",
        theme_color: "#0f1712",
        background_color: "#0f1712",
        display: "standalone",
        orientation: "landscape",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,svg}"],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: ["tests/**", "node_modules/**", "dist/**"],
  },
});
