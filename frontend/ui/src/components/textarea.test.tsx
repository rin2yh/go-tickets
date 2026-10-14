// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Label } from "./label";
import { Textarea } from "./textarea";

afterEach(cleanup);

describe("Textarea", () => {
  it("lets a user enter multiline text in a field with an accessible name", () => {
    render(
      <>
        <Label htmlFor="description">イベントの説明</Label>
        <Textarea id="description" />
      </>,
    );
    const description = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "イベントの説明",
    });

    fireEvent.change(description, { target: { value: "一日目\n二日目" } });

    expect(description.value).toBe("一日目\n二日目");
  });
});
