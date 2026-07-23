// Escape a value for one CSV cell: RFC-4180 quoting PLUS neutralization of
// spreadsheet formula injection. Excel/Sheets execute a cell that begins with
// `= + - @` (or a leading tab/CR), so a user-controlled field like a display
// name of `=HYPERLINK(...)` would run when staff open an export. Prefixing such
// a cell with a single quote makes the spreadsheet render it as literal text.
// Always route user-controlled text through this; server-generated numeric
// columns can be written raw so they stay numeric.
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Minimal RFC-4180-ish CSV parser used by the seller bulk-import tool (Step
// 17.7). Handles quoted fields, escaped quotes (""), and CRLF/LF line endings.
// Kept in its own pure module (no "use server") so it can be unit tested.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines (rows whose every field is empty/whitespace).
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}
