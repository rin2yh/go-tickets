// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Progress } from "@go-tickets/ui/components/progress";

afterEach(cleanup);

const cases = [
  {
    name: "normalizes a zero max",
    value: 50,
    max: 0,
    indicatorTransform: "translateX(-50%)",
  },
  {
    name: "accepts a zero value",
    value: 0,
    max: 10,
    indicatorTransform: "translateX(-100%)",
  },
  {
    name: "treats a value above max as indeterminate",
    value: 11,
    max: 10,
    indicatorTransform: "translateX(-100%)",
  },
  {
    name: "keeps a null value indeterminate",
    value: null,
    max: 10,
    indicatorTransform: "translateX(-100%)",
  },
  {
    name: "shows a normal progress value",
    value: 25,
    max: 100,
    indicatorTransform: "translateX(-75%)",
  },
] satisfies {
  name: string;
  value: number | null;
  max: number;
  indicatorTransform: string;
}[];

it.each(cases)("$name", ({ value, max, indicatorTransform }) => {
  const { container } = render(<Progress value={value} max={max} />);
  expect(
    container.querySelector('[data-slot="progress-indicator"]')?.getAttribute("style"),
  ).toContain(indicatorTransform);
});
