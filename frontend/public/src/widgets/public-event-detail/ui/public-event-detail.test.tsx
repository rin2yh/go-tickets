import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown } from "./public-event-detail";

afterEach(cleanup);

describe("event description markdown", () => {
  it("does not render raw HTML or unsafe link schemes", () => {
    const markup = '<img src=x onerror="alert(1)">';
    render(<Markdown text={`${markup}\n\n[unsafe](javascript:alert(1))`} />);

    expect(screen.getByText(markup)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("unsafe").closest("a")?.getAttribute("href")).not.toMatch(
      /^javascript:/i,
    );
  });
});
