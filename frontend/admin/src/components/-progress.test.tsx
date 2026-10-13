// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Progress } from "@go-tickets/ui/components/progress";

afterEach(cleanup);

it("uses Radix's default max when max is zero", () => {
  const { container } = render(<Progress value={0} max={0} />);
  const progress = screen.getByRole("progressbar");

  expect(progress.getAttribute("aria-valuemin")).toBe("0");
  expect(progress.getAttribute("aria-valuenow")).toBe("0");
  expect(progress.getAttribute("aria-valuemax")).toBe("100");
  expect(
    container.querySelector('[data-slot="progress-indicator"]')?.getAttribute("style"),
  ).toContain("translateX(-100%)");
});

it("accepts a zero value", () => {
  render(<Progress value={0} max={10} />);
  const progress = screen.getByRole("progressbar");

  expect(progress.getAttribute("aria-valuenow")).toBe("0");
  expect(progress.getAttribute("aria-valuemax")).toBe("10");
});

it("treats a value above max as indeterminate", () => {
  const { container } = render(<Progress value={11} max={10} />);
  const progress = screen.getByRole("progressbar");

  expect(progress.getAttribute("aria-valuenow")).toBeNull();
  expect(progress.getAttribute("aria-valuemax")).toBe("10");
  expect(progress.getAttribute("data-state")).toBe("indeterminate");
  expect(
    container.querySelector('[data-slot="progress-indicator"]')?.getAttribute("style"),
  ).toContain("translateX(-100%)");
});

it("keeps a null value indeterminate", () => {
  render(<Progress value={null} max={10} />);
  const progress = screen.getByRole("progressbar");

  expect(progress.getAttribute("aria-valuenow")).toBeNull();
  expect(progress.getAttribute("aria-valuemax")).toBe("10");
  expect(progress.getAttribute("data-state")).toBe("indeterminate");
});

it("shows a normal progress value", () => {
  const { container } = render(<Progress value={25} max={100} />);
  const progress = screen.getByRole("progressbar");

  expect(progress.getAttribute("aria-valuenow")).toBe("25");
  expect(progress.getAttribute("aria-valuemax")).toBe("100");
  expect(progress.getAttribute("aria-valuetext")).toBe("25%");
  expect(
    container.querySelector('[data-slot="progress-indicator"]')?.getAttribute("style"),
  ).toContain("translateX(-75%)");
});
