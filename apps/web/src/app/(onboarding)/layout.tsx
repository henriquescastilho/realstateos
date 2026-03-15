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
        alignItems: "flex-start",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}
