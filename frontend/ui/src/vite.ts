import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcssPlugin from "@tailwindcss/vite";

interface TailwindOptions {
  config?: URL;
}

export function tailwindcss({ config }: TailwindOptions = {}) {
  const plugins = tailwindcssPlugin();
  if (!config) return plugins;

  const configPath = fileURLToPath(config);
  return [
    {
      name: "go-tickets:tailwind-config",
      enforce: "pre" as const,
      transform(source: string, id: string) {
        const cssPath = id.split("?", 1)[0];
        if (!cssPath.endsWith(".css") || !source.includes('@import "tailwindcss"')) return null;
        if (source.includes("@config")) return null;

        // Attach this Vite app's config to its Tailwind entry before Tailwind compiles it.
        const configRelativePath = relative(dirname(cssPath), configPath).replaceAll("\\", "/");
        const configSpecifier = configRelativePath.startsWith(".")
          ? configRelativePath
          : `./${configRelativePath}`;
        return source.replace(
          /(@import\s+["']tailwindcss["']\s*;?)/,
          `$1\n@config "${configSpecifier}";`,
        );
      },
    },
    ...plugins,
  ];
}
