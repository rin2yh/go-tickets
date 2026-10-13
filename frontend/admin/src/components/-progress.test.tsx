// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Progress } from "@go-tickets/ui/components/progress";

afterEach(cleanup);

const cases = [
  {
    name: "normalizes a zero max",
    value: 0,
    max: 0,
    ariaValueNow: "0",
    ariaValueMax: "100",
    ariaValueText: "0%",
    state: "loading",
    indicatorTransform: "translateX(-100%)",
  },
  {
    name: "accepts a zero value",
    value: 0,
    max: 10,
    ariaValueNow: "0",
    ariaValueMax: "10",
    ariaValueText: "0%",
    state: "loading",
    indicatorTransform: "translateX(-100%)",
  },
  {
    name: "treats a value above max as indeterminate",
    value: 11,
    max: 10,
    ariaValueNow: null,
    ariaValueMax: "10",
    ariaValueText: null,
    state: "indeterminate",
    indicatorTransform: "translateX(-100%)",
  },
  {
    name: "keeps a null value indeterminate",
    value: null,
    max: 10,
    ariaValueNow: null,
    ariaValueMax: "10",
    ariaValueText: null,
    state: "indeterminate",
    indicatorTransform: "translateX(-100%)",
  },
  {
    name: "shows a normal progress value",
    value: 25,
    max: 100,
    ariaValueNow: "25",
    ariaValueMax: "100",
    ariaValueText: "25%",
    state: "loading",
    indicatorTransform: "translateX(-75%)",
  },
] satisfies {
  name: string;
  value: number | null;
  max: number;
  ariaValueNow: string | null;
  ariaValueMax: string;
  ariaValueText: string | null;
  state: "loading" | "indeterminate";
  indicatorTransform: string;
}[];

it.each(cases)(
  "$name",
  ({ value, max, ariaValueNow, ariaValueMax, ariaValueText, state, indicatorTransform }) => {
    const { container } = render(<Progress value={value} max={max} />);
    const progress = screen.getByRole("progressbar");

    expect(progress.getAttribute("aria-valuemin")).toBe("0");
    expect(progress.getAttribute("aria-valuenow")).toBe(ariaValueNow);
    expect(progress.getAttribute("aria-valuemax")).toBe(ariaValueMax);
    expect(progress.getAttribute("aria-valuetext")).toBe(ariaValueText);
    expect(progress.getAttribute("data-state")).toBe(state);
    expect(
      container.querySelector('[data-slot="progress-indicator"]')?.getAttribute("style"),
    ).toContain(indicatorTransform);
  },
);
