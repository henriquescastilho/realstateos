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

// ─── Auth (no auth required) ───
app.use("/api/v1", authRouter);

// ─── Webhooks (no auth — called by external services) ───
import { webhooksRouter } from "./modules/webhooks/router";
app.use("/api/v1", webhooksRouter);

// ─── Email template preview (no auth — dev only) ───
import { previewRouter } from "./modules/communications/preview-router";
app.use("/api/v1", previewRouter);

// ─── Module routers (auth + org-scoping) ───
import { onboardingRouter } from "./modules/onboarding/router";
import { contractsRouter } from "./modules/contracts/router";
import { billingRouter } from "./modules/billing/router";
import { paymentsRouter } from "./modules/payments/router";
import { communicationsRouter } from "./modules/communications/router";
import { integrationsRouter } from "./modules/integrations/router";
import { eventsRouter } from "./modules/events/router";
import { channelsRouter } from "./modules/communications/channels-router";
import { inboxRouter } from "./modules/inbox/router";
import { aiAssistantRouter } from "./modules/ai-assistant/router";
import { agentsRouter } from "./modules/agents/router";
import { analyticsRouter } from "./modules/analytics/router";
import { propertiesRouter } from "./modules/properties/router";
import { reportsRouter } from "./modules/reports/router";
import { stubsRouter } from "./modules/stubs/router";

app.use("/api/v1", requireAuth, requireOrgMatch, onboardingRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, contractsRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, billingRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, paymentsRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, communicationsRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, integrationsRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, eventsRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, channelsRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, inboxRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, aiAssistantRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, agentsRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, analyticsRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, propertiesRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, reportsRouter);
app.use("/api/v1", requireAuth, requireOrgMatch, stubsRouter);

// ─── Global error handler (must be last) ───
app.use(errorHandler);

// Only start server when run directly (not imported by tests)
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`[api-node] running on port ${PORT}`);
  });
}

export default app;
