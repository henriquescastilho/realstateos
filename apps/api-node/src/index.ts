import "dotenv/config";
import express, { Request, Response } from "express";
import { errorHandler } from "./middleware/errorHandler";
import { securityHeaders, corsMiddleware, apiRateLimit, auditLog } from "./middleware/security";
import { requireAuth, requireOrgMatch } from "./middleware/auth";
import { authRouter } from "./modules/auth/router";

const app = express();
const PORT = process.env.PORT ?? 8082;

// ─── Security middleware (applied globally) ───
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(apiRateLimit);
app.use(express.json({ limit: "1mb" }));
app.use(auditLog);

// ─── Health (no auth required) ───
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", version: "node", service: "api-node" });
});

// ─── Auth (no auth required — this IS the auth endpoint) ───
app.use("/api/v1", authRouter);

// ─── Authenticated routes (auth + org-scoping applied) ───
// Module routers (uncomment as modules are implemented)
// import { onboardingRouter } from "./modules/onboarding/router";
// import { billingRouter } from "./modules/billing/router";
// import { paymentsRouter } from "./modules/payments/router";
// import { communicationsRouter } from "./modules/communications/router";
// import { maintenanceRouter } from "./modules/maintenance/router";
// import { integrationsRouter } from "./modules/integrations/router";
// app.use("/api/v1", requireAuth, requireOrgMatch, onboardingRouter);
// app.use("/api/v1", requireAuth, requireOrgMatch, billingRouter);
// app.use("/api/v1", requireAuth, requireOrgMatch, paymentsRouter);
// app.use("/api/v1", requireAuth, requireOrgMatch, communicationsRouter);
// app.use("/api/v1", requireAuth, requireOrgMatch, maintenanceRouter);
// app.use("/api/v1", requireAuth, requireOrgMatch, integrationsRouter);

// ─── Global error handler (must be last) ───
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[api-node] running on port ${PORT}`);
});

export default app;
