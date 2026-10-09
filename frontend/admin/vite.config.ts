import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import babel from "@rolldown/plugin-babel";
import reactCompiler from "babel-plugin-react-compiler";

export default defineConfig({
  base: "/",
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    babel({
      include: /\.[jt]sx?$/,
      plugins: [[reactCompiler, { target: "19" }]],
    }),
  ],
  build: { outDir: "../../backend/build/admin-assets", emptyOutDir: true },
});
