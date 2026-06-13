import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const githubPages = process.env.GITHUB_PAGES === "true";
const desktopBuild = process.env.DESKTOP_BUILD === "true";
const relativeBase = githubPages || desktopBuild;

export default defineConfig({
  // Relative base for GitHub Pages and Electron (file://); dev uses "/" by default.
  base: relativeBase ? "./" : "/",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_GITHUB_PAGES": JSON.stringify(
      githubPages ? "true" : "false"
    ),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom")) return "react";
          if (id.includes("node_modules/react/")) return "react";
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:3847",
        changeOrigin: true,
      },
    },
  },
});
