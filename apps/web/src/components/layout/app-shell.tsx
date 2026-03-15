"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { OrgSwitcher } from "./OrgSwitcher";
import { NotificationBell } from "./NotificationBell";

const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/properties", label: "Imóveis" },
  { href: "/contracts", label: "Contratos" },
  { href: "/renters", label: "Locatários" },
  { href: "/owners", label: "Proprietários" },
  { href: "/charges", label: "Cobranças" },
  { href: "/billing", label: "Faturas" },
  { href: "/payments", label: "Pagamentos" },
  { href: "/communications", label: "Comunicações" },
  { href: "/reports", label: "Relatórios" },
  { href: "/settings", label: "Configurações" },
  { href: "/documents", label: "Documentos" },
  { href: "/tasks", label: "Tarefas" },
  { href: "/agents", label: "Agentes" },
  { href: "/escalations", label: "Escalações" },
  { href: "/maintenance", label: "Manutenção" },
];

const PUBLIC_PREFIXES = ["/login", "/register", "/forgot-password", "/reset-password", "/onboarding"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isPublicRoute = PUBLIC_PREFIXES.some(
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

        <OrgSwitcher />
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
            {sidebarOpen ? "✕" : "☰"}
          </button>
          <NotificationBell />
        </header>
        <main className="page-frame">{children}</main>
      </div>
    </div>
  );
}
