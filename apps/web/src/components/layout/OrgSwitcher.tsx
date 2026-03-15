"use client";

import React, { useSyncExternalStore, useState } from "react";
import { useRouter } from "next/navigation";
import { getSnapshot, subscribe, switchOrg, clearAuth } from "@/lib/auth";
import type { AuthState } from "@/lib/auth";

const SERVER_SNAPSHOT: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  orgs: [],
};

export function OrgSwitcher() {
  const router = useRouter();
  const auth = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  const [open, setOpen] = useState(false);

  if (!auth.user) return null;

  function handleSwitch(orgId: string) {
    switchOrg(orgId);
    setOpen(false);
    // Reload to refresh data scoped to new org
    router.refresh();
  }

  function handleLogout() {
    clearAuth();
    // Clear auth cookie
    document.cookie = "ro_auth=; path=/; max-age=0";
    router.replace("/login");
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        className="ghost-button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          width: "100%",
          textAlign: "left",
          borderRadius: 14,
          padding: "10px 14px",
          display: "grid",
          gap: 2,
        }}
      >
        <span
          style={{
            fontSize: "0.78rem",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Organização
        </span>
        <span
          style={{
            fontSize: "0.92rem",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {auth.user.org_name}
        </span>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {auth.user.email}
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Selecionar organização"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 0,
            right: 0,
            background: "rgba(255,252,246,0.98)",
            border: "1px solid rgba(31,41,55,0.1)",
            borderRadius: 16,
            backdropFilter: "blur(16px)",
            boxShadow: "0 8px 40px rgba(122,86,45,0.14)",
            overflow: "hidden",
            zIndex: 100,
          }}
        >
          {auth.orgs.length > 1 && (
            <>
              <p
                style={{
                  margin: 0,
                  padding: "10px 14px 4px",
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Trocar organização
              </p>
              {auth.orgs.map((org) => (
                <button
                  key={org.id}
                  role="option"
                  aria-selected={org.id === auth.user?.org_id}
                  onClick={() => handleSwitch(org.id)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    textAlign: "left",
                    background:
                      org.id === auth.user?.org_id
                        ? "rgba(180,90,42,0.08)"
                        : "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    fontWeight: org.id === auth.user?.org_id ? 600 : 400,
                    color:
                      org.id === auth.user?.org_id
                        ? "var(--accent-dark)"
                        : "inherit",
                  }}
                >
                  {org.name}
                </button>
              ))}
              <hr
                style={{
                  margin: "4px 0",
                  border: "none",
                  borderTop: "1px solid rgba(31,41,55,0.08)",
                }}
              />
            </>
          )}

          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              padding: "10px 14px",
              textAlign: "left",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "0.9rem",
              color: "#991b1b",
            }}
          >
            Sair
          </button>
        </div>
      )}

      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 99 }}
        />
      )}
    </div>
  );
}
