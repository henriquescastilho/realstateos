import "dotenv/config";
import express, { Request, Response } from "express";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
const PORT = process.env.PORT ?? 8082;

app.use(express.json());

// ─── Health ───
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", version: "node", service: "api-node" });
});

// ─── Module routers ───
import { onboardingRouter } from "./modules/onboarding/router";
import { billingRouter } from "./modules/billing/router";
import { paymentsRouter } from "./modules/payments/router";
import { communicationsRouter } from "./modules/communications/router";
import { maintenanceRouter } from "./modules/maintenance/router";
import { integrationsRouter } from "./modules/integrations/router";

app.use("/api/v1", onboardingRouter);
app.use("/api/v1", billingRouter);
app.use("/api/v1", paymentsRouter);
app.use("/api/v1", communicationsRouter);
app.use("/api/v1", maintenanceRouter);
app.use("/api/v1", integrationsRouter);

// ─── Global error handler (must be last) ───
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[api-node] running on port ${PORT}`);
});

export default app;
