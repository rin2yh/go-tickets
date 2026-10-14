// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Input } from "./input";
import { Label } from "./label";

afterEach(cleanup);

describe("Input", () => {
  it("exposes the field name and validation state to users of assistive technology", () => {
    render(
      <>
        <Label htmlFor="email">メールアドレス</Label>
        <Input id="email" type="email" aria-invalid="true" />
      </>,
    );

    expect(
      screen.getByRole("textbox", { name: "メールアドレス" }).getAttribute("aria-invalid"),
    ).toBe("true");
  });
});
