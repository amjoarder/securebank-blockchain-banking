import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The app is served from its production build by scripts/serve.js (see docs/DEV_NOTES.md),
// so only `vite build` is used. Runtime data comes from /runtime/* and /rpc on the same origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/ethers")) return "ethers";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) return "charts";
        },
      },
    },
  },
});
