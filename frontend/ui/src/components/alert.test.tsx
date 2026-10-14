// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Alert, AlertDescription, AlertTitle } from "./alert";

afterEach(cleanup);

describe("Alert", () => {
  it("announces an error and its recovery guidance to assistive technology", () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>保存できません</AlertTitle>
        <AlertDescription>入力を確認してください。</AlertDescription>
      </Alert>,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("保存できません");
    expect(alert.textContent).toContain("入力を確認してください。");
  });
});
