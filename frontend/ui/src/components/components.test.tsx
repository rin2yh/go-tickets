// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { Badge } from "./badge";
import { Button } from "./button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
import { Input } from "./input";
import { Label } from "./label";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "./native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";
import { Textarea } from "./textarea";

afterEach(cleanup);

describe("shared UI components", () => {
  it("renders alert title and description with alert semantics", () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>保存できません</AlertTitle>
        <AlertDescription>入力を確認してください。</AlertDescription>
      </Alert>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("保存できません")).toBeTruthy();
    expect(screen.getByText("入力を確認してください。")).toBeTruthy();
  });

  it.each(["default", "secondary", "destructive", "outline", "ghost", "link"] as const)(
    "renders the %s badge variant",
    (variant) => {
      render(<Badge variant={variant}>イベント</Badge>);

      expect(screen.getByText("イベント").tagName).toBe("SPAN");
    },
  );

  it("supports button actions, disabled state, and link composition", () => {
    const onClick = vi.fn();
    render(
      <>
        <Button size="sm" onClick={onClick}>
          保存
        </Button>
        <Button disabled>処理中</Button>
        <Button asChild>
          <a href="/events">イベント</a>
        </Button>
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "処理中" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("link", { name: "イベント" }).getAttribute("href")).toBe("/events");
  });

  it("renders card sections and their content", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>イベント</CardTitle>
          <CardDescription>概要</CardDescription>
          <CardAction>編集</CardAction>
        </CardHeader>
        <CardContent>詳細</CardContent>
        <CardFooter>保存済み</CardFooter>
      </Card>,
    );

    for (const content of ["イベント", "概要", "編集", "詳細", "保存済み"])
      expect(screen.getByText(content)).toBeTruthy();
  });

  it("accepts and updates an input value", () => {
    render(
      <>
        <Label htmlFor="email">メールアドレス</Label>
        <Input id="email" type="email" />
      </>,
    );
    const input = screen.getByRole("textbox", { name: "メールアドレス" });

    fireEvent.change(input, { target: { value: "person@example.com" } });

    expect(screen.getByDisplayValue("person@example.com")).toBeTruthy();
  });

  it("updates a native select and renders grouped options", () => {
    render(
      <NativeSelect aria-label="チケット">
        <NativeSelectOptGroup label="一般">
          <NativeSelectOption value="regular">一般チケット</NativeSelectOption>
        </NativeSelectOptGroup>
        <NativeSelectOption value="student">学生チケット</NativeSelectOption>
      </NativeSelect>,
    );
    const select = screen.getByRole("combobox", { name: "チケット" });

    fireEvent.change(select, { target: { value: "student" } });

    expect(screen.getByDisplayValue("学生チケット")).toBeTruthy();
    expect(screen.getByRole("group", { name: "一般" })).toBeTruthy();
  });

  it("renders a semantic table header, row, and cell", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名前</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>参加者</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "名前" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "参加者" })).toBeTruthy();
  });

  it("accepts text in a labeled textarea", () => {
    render(
      <>
        <Label htmlFor="description">説明</Label>
        <Textarea id="description" />
      </>,
    );
    const textarea = screen.getByRole("textbox", { name: "説明" });

    fireEvent.change(textarea, { target: { value: "イベントの説明" } });

    expect(screen.getByDisplayValue("イベントの説明")).toBeTruthy();
  });
});
