import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown } from "./public-events";

afterEach(cleanup);

describe("event description markdown", () => {
  it("renders raw HTML and unsafe link schemes as text", () => {
    const markup = '<img src=x onerror="alert(1)">';
    render(<Markdown text={`${markup}\n\n[unsafe](javascript:alert(1))`} />);

    expect(screen.getByText(markup)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
