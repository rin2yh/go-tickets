// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Label } from "./label";
import { NativeSelect, NativeSelectOption } from "./native-select";

afterEach(cleanup);

describe("NativeSelect", () => {
  it("lets a user choose an option from an accessibly named field", () => {
    render(
      <>
        <Label htmlFor="ticket">チケット</Label>
        <NativeSelect id="ticket" defaultValue="regular">
          <NativeSelectOption value="regular">一般</NativeSelectOption>
          <NativeSelectOption value="student">学生</NativeSelectOption>
        </NativeSelect>
      </>,
    );
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "チケット" });

    fireEvent.change(select, { target: { value: "student" } });

    expect(select.value).toBe("student");
  });
});
