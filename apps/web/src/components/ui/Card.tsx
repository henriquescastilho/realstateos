"use client";

import React from "react";

export interface CardProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export function Card({
  children,
  title,
  description,
  actions,
  style,
  className,
}: CardProps) {
  return (
    <div className={`card ${className ?? ""}`} style={style}>
      {(title || description || actions) && (
        <div
          className="card-header"
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div>
            {title && <h3 style={{ margin: 0 }}>{title}</h3>}
            {description && (
              <p style={{ margin: "6px 0 0", color: "rgba(31,41,55,0.65)" }}>
                {description}
              </p>
            )}
          </div>
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
