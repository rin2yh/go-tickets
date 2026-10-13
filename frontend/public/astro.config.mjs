import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import babel from "@rolldown/plugin-babel";
import reactCompiler from "babel-plugin-react-compiler";
import { tailwindcss } from "@go-tickets/ui/vite";

export default defineConfig({
  output: "static",
  integrations: [react()],
  vite: {
    plugins: [
      tailwindcss(),
      babel({ include: /\.[jt]sx?$/, plugins: [[reactCompiler, { target: "19" }]] }),
    ],
  },
  outDir: "../../backend/build/public-assets",
});
