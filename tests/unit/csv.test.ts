import { describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("parses a simple header + rows", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n4,5,6");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted fields with commas and CRLF", () => {
    const rows = parseCsv('title,price\r\n"Mouse, wireless",12.5\r\n');
    expect(rows).toEqual([
      ["title", "price"],
      ["Mouse, wireless", "12.5"],
    ]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const rows = parseCsv('name\n"He said ""hi"""');
    expect(rows).toEqual([["name"], ['He said "hi"']]);
  });

  it("preserves newlines inside quoted fields", () => {
    const rows = parseCsv('desc\n"line one\nline two"');
    expect(rows).toEqual([["desc"], ["line one\nline two"]]);
  });

  it("drops fully blank lines", () => {
    const rows = parseCsv("a,b\n\n1,2\n   \n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty trailing fields", () => {
    const rows = parseCsv("a,b,c\n1,,3");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });
});
