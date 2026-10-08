import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  build: {
    outDir: "../backend/build/web",
    emptyOutDir: true,
    target: "es2022",
  },
});
