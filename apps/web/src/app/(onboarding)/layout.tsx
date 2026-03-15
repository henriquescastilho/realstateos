import type { Metadata } from "next";

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
    <div
      style={{
        minHeight: "100vh",
        padding: "40px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
      }}
    >
      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", width: "100%" }}>
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
