import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Bem-vindo — Real Estate OS",
};

/**
 * Onboarding layout: full-screen, no sidebar, centered scroll.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          minHeight: "100vh",
          padding: "40px 16px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
        }}
      >
        {children}
      </body>
    </html>
  );
}
