import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import babel from "@rolldown/plugin-babel";
import reactCompiler from "babel-plugin-react-compiler";

export default defineConfig({
  output: "static",
  integrations: [react()],
  vite: {
    plugins: [babel({ include: /\.[jt]sx?$/, plugins: [[reactCompiler, { target: "19" }]] })],
  },
  outDir: "../../backend/build/public-assets",
});
