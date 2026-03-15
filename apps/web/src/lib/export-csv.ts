/**
 * Exports an array of objects as a CSV file download.
 */
export function exportCSV<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: string; header: string; format?: (row: T) => string }[],
  filename: string,
) {
  if (rows.length === 0) return;

  const sep = ";";
  const header = columns.map((c) => `"${c.header}"`).join(sep);

  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const val = col.format
            ? col.format(row)
            : String(row[col.key] ?? "");
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(sep),
    )
    .join("\n");

  const bom = "\uFEFF"; // UTF-8 BOM for Excel
  const blob = new Blob([bom + header + "\n" + body], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
