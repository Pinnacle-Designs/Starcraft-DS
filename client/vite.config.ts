import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const githubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  // Relative base works for both github.io/Starcraft-DS and the custom domain root.
  base: githubPages ? "./" : "/",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_GITHUB_PAGES": JSON.stringify(
      githubPages ? "true" : "false"
    ),
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
