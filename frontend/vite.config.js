import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "../backend/build/web",
    emptyOutDir: true,
    target: "es2022",
  },
});
