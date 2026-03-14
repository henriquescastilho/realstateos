"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrgSwitcher } from "./OrgSwitcher";

const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/properties", label: "Imóveis" },
  { href: "/contracts", label: "Contratos" },
  { href: "/charges", label: "Cobranças" },
  { href: "/documents", label: "Documentos" },
  { href: "/tasks", label: "Tarefas" },
  { href: "/agents", label: "Agentes" },
  { href: "/escalations", label: "Escalações" },
  { href: "/maintenance", label: "Manutenção" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
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

      <main className="page-frame">{children}</main>
    </div>
  );
}
