import type { Metadata } from "next";
import "../globals.css";

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
    <html lang="pt-BR">
      <body
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "24px 16px",
        }}
      >
        {children}
      </body>
    </html>
  );
}
