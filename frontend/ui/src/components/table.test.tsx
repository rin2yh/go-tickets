// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

afterEach(cleanup);

describe("Table", () => {
  it("associates each participant with its column heading", () => {
    render(
      <Table>
        <caption>イベント参加者</caption>
        <TableHeader>
          <TableRow>
            <TableHead>名前</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>佐藤 花子</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole("table", { name: "イベント参加者" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "名前" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "佐藤 花子" })).toBeTruthy();
  });
});
