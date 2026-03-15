import { Router, Request, Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { ok, created, noContent, paginated } from "../../lib/response";
import { db } from "../../db";
import { charges } from "../../db/schema";
import {
  createContractSchema,
  updateContractSchema,
  transitionStatusSchema,
  listContractsQuerySchema,
} from "./validators";
import {
  listContracts,
  getContractById,
  createContract,
  updateContract,
  transitionContractStatus,
  deleteContract,
} from "./service";

export const contractsRouter = Router();

// Map DB row to frontend-expected format
function mapContract(row: Record<string, unknown>) {
  return {
    id: row.id,
    tenant_id: row.orgId,
    property_id: row.propertyId,
    renter_id: row.tenantId,
    owner_id: row.ownerId,
    start_date: row.startDate,
    end_date: row.endDate,
    monthly_rent: row.rentAmount,
    closing_day: row.closingDay ?? 27,
    due_day: row.dueDateDay ?? 1,
    payout_day: row.payoutDay ?? 4,
    status: row.operationalStatus === "pending_onboarding" ? "pending" : row.operationalStatus,
    admin_fee_percent: row.adminFeePercent ?? "10.00",
    admin_fee_minimum: row.adminFeeMinimum ?? "180.00",
    agent_instructions: row.agentInstructions ?? "",
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

// GET /contracts — list with filters + pagination
contractsRouter.get("/contracts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listContractsQuerySchema.parse({
      ...req.query,
      orgId: req.user?.org_id,
    });
    const { rows, total } = await listContracts(query);
    const mapped = rows.map((r) => mapContract(r as unknown as Record<string, unknown>));
    paginated(res, mapped, { total, page: query.page, pageSize: query.pageSize });
  } catch (err) {
    next(err);
  }
});

// GET /contracts/:id — detail (enriched with charges)
contractsRouter.get("/contracts/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = await getContractById(req.params.id!, req.user!.org_id);
    const mapped = mapContract(contract as unknown as Record<string, unknown>);

    // Fetch charges for this contract
    const contractCharges = await db
      .select()
      .from(charges)
      .where(
        and(
          eq(charges.leaseContractId, req.params.id!),
          eq(charges.orgId, req.user!.org_id),
        ),
      )
      .orderBy(charges.dueDate);

    const mappedCharges = contractCharges.map((c) => ({
      id: c.id,
      description: `Aluguel ${c.billingPeriod}`,
      amount: c.netAmount,
      due_date: c.dueDate,
      status: c.paymentStatus,
      issue_status: c.issueStatus,
      billing_period: c.billingPeriod,
      line_items: c.lineItems,
      boleto_status: c.boletoStatus,
    }));

    ok(res, { ...mapped, charges: mappedCharges });
  } catch (err) {
    next(err);
  }
});

// POST /contracts — create
contractsRouter.post("/contracts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createContractSchema.parse({
      ...req.body,
      orgId: req.user?.org_id,
    });
    const contract = await createContract(input);
    created(res, contract);
  } catch (err) {
    next(err);
  }
});

// PATCH /contracts/:id — partial update
contractsRouter.patch("/contracts/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateContractSchema.parse({
      ...req.body,
      orgId: req.user?.org_id,
    });
    const contract = await updateContract(req.params.id!, input);
    ok(res, contract);
  } catch (err) {
    next(err);
  }
});

// POST /contracts/:id/transition — status workflow
contractsRouter.post(
  "/contracts/:id/transition",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = transitionStatusSchema.parse({
        ...req.body,
        orgId: req.user?.org_id,
      });
      const contract = await transitionContractStatus(req.params.id!, input);
      ok(res, contract);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /contracts/:id — soft delete (sets status=terminated)
contractsRouter.delete(
  "/contracts/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteContract(req.params.id!, req.user!.org_id);
      noContent(res);
    } catch (err) {
      next(err);
    }
  },
);
