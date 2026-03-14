import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  organizations,
  properties,
  owners,
  tenants,
  leaseContracts,
  billingSchedules,
  charges,
  payments,
  statements,
  maintenanceTickets,
  messageRecords,
  agentTasks,
  integrationConnectors,
  documents,
} from "../db/schema";

// ─── Select types (read from DB) ───
export type Organization = InferSelectModel<typeof organizations>;
export type Property = InferSelectModel<typeof properties>;
export type Owner = InferSelectModel<typeof owners>;
export type Tenant = InferSelectModel<typeof tenants>;
export type LeaseContract = InferSelectModel<typeof leaseContracts>;
export type BillingSchedule = InferSelectModel<typeof billingSchedules>;
export type Charge = InferSelectModel<typeof charges>;
export type Payment = InferSelectModel<typeof payments>;
export type Statement = InferSelectModel<typeof statements>;
export type MaintenanceTicket = InferSelectModel<typeof maintenanceTickets>;
export type MessageRecord = InferSelectModel<typeof messageRecords>;
export type AgentTask = InferSelectModel<typeof agentTasks>;
export type IntegrationConnector = InferSelectModel<typeof integrationConnectors>;
export type Document = InferSelectModel<typeof documents>;

// ─── Insert types (write to DB) ───
export type NewOrganization = InferInsertModel<typeof organizations>;
export type NewProperty = InferInsertModel<typeof properties>;
export type NewOwner = InferInsertModel<typeof owners>;
export type NewTenant = InferInsertModel<typeof tenants>;
export type NewLeaseContract = InferInsertModel<typeof leaseContracts>;
export type NewBillingSchedule = InferInsertModel<typeof billingSchedules>;
export type NewCharge = InferInsertModel<typeof charges>;
export type NewPayment = InferInsertModel<typeof payments>;
export type NewStatement = InferInsertModel<typeof statements>;
export type NewMaintenanceTicket = InferInsertModel<typeof maintenanceTickets>;
export type NewMessageRecord = InferInsertModel<typeof messageRecords>;
export type NewAgentTask = InferInsertModel<typeof agentTasks>;
export type NewIntegrationConnector = InferInsertModel<typeof integrationConnectors>;
export type NewDocument = InferInsertModel<typeof documents>;

// ─── Enums (canonical states) ───
export const LeaseContractStatus = {
  PENDING_ONBOARDING: "pending_onboarding",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  TERMINATED: "terminated",
} as const;

export const ChargeIssueStatus = {
  DRAFT: "draft",
  READY_TO_ISSUE: "ready_to_issue",
  ISSUED: "issued",
  FAILED: "failed",
} as const;

export const ChargePaymentStatus = {
  OPEN: "open",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  OVERDUE: "overdue",
  WRITTEN_OFF: "written_off",
} as const;

export const MaintenanceStatus = {
  OPEN: "open",
  TRIAGED: "triaged",
  IN_PROGRESS: "in_progress",
  WAITING_EXTERNAL: "waiting_external",
  RESOLVED: "resolved",
  CLOSED: "closed",
} as const;

export const AgentTaskStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  ESCALATED: "escalated",
  CANCELLED: "cancelled",
} as const;

export const ReconciliationStatus = {
  UNMATCHED: "unmatched",
  MATCHED: "matched",
  PARTIAL: "partial",
  DIVERGENT: "divergent",
} as const;
