"use client";

import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T, index: number) => React.ReactNode;
  width?: string | number;
  align?: "left" | "center" | "right";
}

export interface TableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  /** Unique key extractor (defaults to index) */
  rowKey?: (row: T, index: number) => string | number;
  /** Message shown when data is empty */
  emptyText?: string;
  /** @deprecated use emptyText */
  emptyMessage?: string;
  loading?: boolean;
  /** Callback for row clicks */
  onRowClick?: (row: T) => void;
  className?: string;
  style?: React.CSSProperties;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Table<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  emptyText,
  emptyMessage = "No data to display.",
  loading = false,
  onRowClick,
  className,
  style,
}: TableProps<T>) {
  const resolvedEmptyText = emptyText ?? emptyMessage;
  const cellAlign = (
    align?: "left" | "center" | "right",
  ): React.CSSProperties =>
    align === "center"
      ? { textAlign: "center" }
      : align === "right"
        ? { textAlign: "right" }
        : { textAlign: "left" };

  return (
    <div
      className={className}
      style={{ overflowX: "auto", width: "100%", ...style }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.9rem",
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: "2px solid rgba(99,102,241,0.15)",
              background: "rgba(99,102,241,0.04)",
            }}
          >
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: "10px 16px",
                  fontWeight: 600,
                  fontSize: "0.8rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "rgba(31,41,55,0.55)",
                  whiteSpace: "nowrap",
                  width: col.width,
                  ...cellAlign(col.align),
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  textAlign: "center",
                  padding: "32px 16px",
                  color: "rgba(31,41,55,0.45)",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 20,
                    height: 20,
                    border: "2px solid rgba(99,102,241,0.3)",
                    borderTopColor: "rgba(99,102,241,0.9)",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                    verticalAlign: "middle",
                    marginRight: 8,
                  }}
                />
                Loading…
              </td>
            </tr>
          )}
          {!loading && data.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  textAlign: "center",
                  padding: "32px 16px",
                  color: "rgba(31,41,55,0.4)",
                  fontStyle: "italic",
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          )}
          {!loading &&
            data.map((row, idx) => {
              const key = rowKey ? rowKey(row, idx) : idx;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    borderBottom: "1px solid rgba(99,102,241,0.08)",
                    cursor: onRowClick ? "pointer" : undefined,
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (onRowClick)
                      (e.currentTarget as HTMLElement).style.background =
                        "rgba(99,102,241,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "";
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        padding: "11px 16px",
                        verticalAlign: "middle",
                        ...cellAlign(col.align),
                      }}
                    >
                      {col.render(row, idx)}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
