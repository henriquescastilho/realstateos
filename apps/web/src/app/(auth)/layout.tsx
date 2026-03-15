import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar — Real Estate OS",
};

/**
 * Auth layout: full-screen centered, no sidebar.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "24px 16px",
      }}
    >
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
        {children}
      </div>
      <footer
        style={{
          textAlign: "center",
          padding: "16px 24px",
          fontSize: "0.78rem",
          color: "var(--text-faint)",
        }}
      >
        Desenvolvido por DME Technology
      </footer>
    </div>
  );
}
