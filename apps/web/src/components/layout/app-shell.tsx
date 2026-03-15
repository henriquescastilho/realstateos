"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { clearAuth } from "@/lib/auth";
import { OrgSwitcher } from "./OrgSwitcher";
import { NotificationBell } from "./NotificationBell";
import { BalanceWidget } from "./BalanceWidget";
import { Icon } from "@/components/ui/Icon";

const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agents", label: "Agentes" },
  { href: "/contracts", label: "Contratos" },
  { href: "/renters", label: "Locatários" },
  { href: "/owners", label: "Proprietários" },
  { href: "/billing", label: "Faturas" },
  { href: "/repasses", label: "Repasses" },
  { href: "/reports", label: "Relatórios" },
  { href: "/maintenance", label: "Manutenção" },
  { href: "/settings", label: "Configurações" },
];

const PUBLIC_PREFIXES = ["/login", "/register", "/forgot-password", "/reset-password", "/onboarding"];
const EXACT_PUBLIC = ["/"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleLogout() {
    clearAuth();
    document.cookie = "ro_auth=; path=/; max-age=0";
    router.replace("/");
  }

  const isPublicRoute =
    EXACT_PUBLIC.includes(pathname) ||
    PUBLIC_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    );

  if (isPublicRoute) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay${sidebarOpen ? " visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar${sidebarOpen ? " sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <p className="eyebrow">REAL ESTATE OS</p>
          <h1 className="brand">Enterprise</h1>
          <p className="sidebar-copy">
            Plataforma multi-tenant para gestão de portfólio imobiliário com IA.
          </p>
        </div>

        <nav className="nav" aria-label="Navegação principal">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActive ? "nav-link active" : "nav-link"}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto", borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <OrgSwitcher />
        </div>
      </aside>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          minWidth: 0,
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.625rem 2.5rem",
            borderBottom: "1px solid var(--line)",
            background: "var(--sand)",
            position: "sticky",
            top: 0,
            zIndex: 50,
            gap: "0.75rem",
          }}
        >
          <button
            className="hamburger-btn"
            aria-label="Abrir menu"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <Icon name={sidebarOpen ? "close" : "menu"} size={20} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginLeft: "auto" }}>
            <BalanceWidget />
            <NotificationBell />
            <button
              onClick={handleLogout}
              title="Sair"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 6,
                display: "flex",
                alignItems: "center",
                color: "var(--text-muted)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </header>
        <main className="page-frame">{children}</main>
        <footer
          style={{
            textAlign: "center",
            padding: "16px 24px",
            fontSize: "0.78rem",
            color: "var(--text-faint)",
            borderTop: "1px solid var(--line)",
          }}
        >
          Desenvolvido por DME Technology
        </footer>
      </div>
    </div>
  );
}
