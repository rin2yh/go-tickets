import { expect, it } from "vitest";
import { tailwindcss } from "./vite";

it("creates the Tailwind Vite plugin", () => {
  expect(tailwindcss()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "@tailwindcss/vite:generate:serve" }),
      expect.objectContaining({ name: "@tailwindcss/vite:generate:build" }),
    ]),
  );
});
