"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
          <h1 className="brand">Billing MVP</h1>
          <p className="sidebar-copy">
            Um fluxo enxuto para demonstrar contrato, cobrança mensal, upload de
            encargos, consolidação e emissão de boleto/PIX.
          </p>
        </div>

        <nav className="nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
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

        <div className="session-box">
          <p className="session-label">Demo flow</p>
          <p className="session-value">
            Imóvel → Contrato → Cobrança → Upload → Consolidação
          </p>
          <p className="session-caption">
            Boleto/PIX e task log aparecem no painel.
          </p>
        </div>
      </aside>

      <main className="page-frame">{children}</main>
    </div>
  );
}
