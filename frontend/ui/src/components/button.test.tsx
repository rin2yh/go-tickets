// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";

afterEach(cleanup);

describe("Button", () => {
  it("runs the requested action when enabled and ignores activation when disabled", () => {
    const onSave = vi.fn();
    render(
      <>
        <Button onClick={onSave}>保存</Button>
        <Button disabled onClick={onSave}>
          処理中
        </Button>
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    fireEvent.click(screen.getByRole("button", { name: "処理中" }));

    expect(onSave).toHaveBeenCalledOnce();
  });

  it("keeps a link accessible when a button is composed with an anchor", () => {
    render(
      <Button asChild>
        <a href="/events">イベント一覧</a>
      </Button>,
    );

    expect(screen.getByRole("link", { name: "イベント一覧" }).getAttribute("href")).toBe("/events");
  });
});
