import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  date,
  numeric,
  integer,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── helpers ───
const id = () => uuid("id").defaultRandom().primaryKey();
const orgId = () => uuid("org_id").notNull();
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

// ─── Organizations (multi-tenant) ───
export const organizations = pgTable("organizations", {
  id: id(),
  name: varchar("name", { length: 255 }).notNull(),
  document: varchar("document", { length: 20 }),
  ...timestamps(),
});

// ─── Properties ───
export const properties = pgTable("properties", {
  id: id(),
  orgId: orgId(),
  address: varchar("address", { length: 500 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  zip: varchar("zip", { length: 10 }).notNull(),
  type: varchar("type", { length: 50 }).default("residential"),
  areaSqm: numeric("area_sqm", { precision: 10, scale: 2 }),
  bedrooms: integer("bedrooms"),
  registryReference: varchar("registry_reference", { length: 100 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  ...timestamps(),
}, (t) => [
  index("properties_org_id_idx").on(t.orgId),
]);

// ─── Owners ───
export const owners = pgTable("owners", {
  id: id(),
  orgId: orgId(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  documentNumber: varchar("document_number", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  payoutPreferences: jsonb("payout_preferences").$type<{
    bankCode?: string;
    branch?: string;
    account?: string;
    accountType?: string;
    pixKey?: string;
  }>(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  ...timestamps(),
}, (t) => [
  index("owners_org_id_idx").on(t.orgId),
]);

// ─── Tenants (inquilinos) ───
export const tenants = pgTable("tenants", {
  id: id(),
  orgId: orgId(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  documentNumber: varchar("document_number", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  guaranteeProfile: jsonb("guarantee_profile").$type<{
    type?: string;
    details?: string;
  }>(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  ...timestamps(),
}, (t) => [
  index("tenants_org_id_idx").on(t.orgId),
]);

// ─── Lease Contracts ───
export const leaseContracts = pgTable("lease_contracts", {
  id: id(),
  orgId: orgId(),
  propertyId: uuid("property_id").notNull(),
  ownerId: uuid("owner_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  rentAmount: numeric("rent_amount", { precision: 12, scale: 2 }).notNull(),
  depositType: varchar("deposit_type", { length: 50 }),
  chargeRules: jsonb("charge_rules").$type<Record<string, unknown>>().default({}),
  payoutRules: jsonb("payout_rules").$type<Record<string, unknown>>().default({}),
  operationalStatus: varchar("operational_status", { length: 30 })
    .default("pending_onboarding")
    .notNull(),
  ...timestamps(),
}, (t) => [
  index("lease_contracts_org_id_idx").on(t.orgId),
  index("lease_contracts_property_id_idx").on(t.propertyId),
  index("lease_contracts_status_idx").on(t.operationalStatus),
]);

// ─── Billing Schedules ───
export const billingSchedules = pgTable("billing_schedules", {
  id: id(),
  orgId: orgId(),
  leaseContractId: uuid("lease_contract_id").notNull(),
  dueDateRule: varchar("due_date_rule", { length: 50 }).default("first_business_day").notNull(),
  chargeComponents: jsonb("charge_components").$type<Array<{
    type: string;
    source: string;
    fixedAmount?: string;
  }>>().default([]),
  collectionMethod: varchar("collection_method", { length: 50 }).default("boleto_pix").notNull(),
  lateFeeRule: jsonb("late_fee_rule").$type<{ percentage: string }>().default({ percentage: "2.00" }),
  interestRule: jsonb("interest_rule").$type<{ dailyPercentage: string }>().default({ dailyPercentage: "0.033" }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  ...timestamps(),
}, (t) => [
  index("billing_schedules_contract_idx").on(t.leaseContractId),
]);

// ─── Charges ───
export const charges = pgTable("charges", {
  id: id(),
  orgId: orgId(),
  leaseContractId: uuid("lease_contract_id").notNull(),
  billingPeriod: varchar("billing_period", { length: 7 }).notNull(), // "2026-03"
  lineItems: jsonb("line_items").$type<Array<{
    type: string;
    description: string;
    amount: string;
    source: string;
  }>>().default([]),
  grossAmount: numeric("gross_amount", { precision: 12, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  penaltyAmount: numeric("penalty_amount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  netAmount: numeric("net_amount", { precision: 12, scale: 2 }).notNull(),
  issueStatus: varchar("issue_status", { length: 20 }).default("draft").notNull(),
  paymentStatus: varchar("payment_status", { length: 20 }).default("open").notNull(),
  secondCopyCount: integer("second_copy_count").default(0).notNull(),
  dueDate: date("due_date").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  ...timestamps(),
}, (t) => [
  index("charges_org_id_idx").on(t.orgId),
  index("charges_contract_idx").on(t.leaseContractId),
  index("charges_period_idx").on(t.billingPeriod),
  index("charges_status_idx").on(t.issueStatus, t.paymentStatus),
  uniqueIndex("charges_idempotency_idx").on(t.leaseContractId, t.billingPeriod, t.issueStatus),
]);

// ─── Payments ───
export const payments = pgTable("payments", {
  id: id(),
  orgId: orgId(),
  chargeId: uuid("charge_id").notNull(),
  receivedAmount: numeric("received_amount", { precision: 12, scale: 2 }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  paymentMethod: varchar("payment_method", { length: 20 }).notNull(),
  bankReference: varchar("bank_reference", { length: 100 }),
  reconciliationStatus: varchar("reconciliation_status", { length: 20 }).default("unmatched").notNull(),
  divergenceReason: text("divergence_reason"),
  ...timestamps(),
}, (t) => [
  index("payments_charge_idx").on(t.chargeId),
  index("payments_bank_ref_idx").on(t.bankReference),
]);

// ─── Statements ───
export const statements = pgTable("statements", {
  id: id(),
  orgId: orgId(),
  ownerId: uuid("owner_id").notNull(),
  leaseContractId: uuid("lease_contract_id").notNull(),
  period: varchar("period", { length: 7 }).notNull(),
  entries: jsonb("entries").$type<Array<{
    type: string;
    description: string;
    amount: string;
  }>>().default([]),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  deliveryStatus: varchar("delivery_status", { length: 20 }).default("pending").notNull(),
  ...timestamps(),
});

// ─── Maintenance Tickets ───
export const maintenanceTickets = pgTable("maintenance_tickets", {
  id: id(),
  orgId: orgId(),
  leaseContractId: uuid("lease_contract_id"),
  propertyId: uuid("property_id").notNull(),
  openedBy: varchar("opened_by", { length: 50 }).notNull(),
  category: varchar("category", { length: 50 }),
  priority: varchar("priority", { length: 20 }).default("medium").notNull(),
  status: varchar("status", { length: 30 }).default("open").notNull(),
  description: text("description").notNull(),
  resolutionSummary: text("resolution_summary"),
  ...timestamps(),
}, (t) => [
  index("maintenance_org_id_idx").on(t.orgId),
  index("maintenance_property_idx").on(t.propertyId),
  index("maintenance_status_idx").on(t.status),
]);

// ─── Message Records ───
export const messageRecords = pgTable("message_records", {
  id: id(),
  orgId: orgId(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  channel: varchar("channel", { length: 20 }).notNull(), // email | whatsapp
  templateType: varchar("template_type", { length: 50 }).notNull(),
  recipient: varchar("recipient", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).default("queued").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  ...timestamps(),
}, (t) => [
  index("messages_entity_idx").on(t.entityType, t.entityId),
]);

// ─── Agent Tasks ───
export const agentTasks = pgTable("agent_tasks", {
  id: id(),
  orgId: orgId(),
  taskType: varchar("task_type", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).default("queued").notNull(),
  input: jsonb("input").$type<Record<string, unknown>>().default({}),
  output: jsonb("output").$type<Record<string, unknown>>(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  failureReason: text("failure_reason"),
  escalationTarget: varchar("escalation_target", { length: 100 }),
  relatedEntityType: varchar("related_entity_type", { length: 50 }),
  relatedEntityId: uuid("related_entity_id"),
  attemptCount: integer("attempt_count").default(0).notNull(),
  ...timestamps(),
}, (t) => [
  index("agent_tasks_org_id_idx").on(t.orgId),
  index("agent_tasks_status_idx").on(t.status),
  index("agent_tasks_entity_idx").on(t.relatedEntityType, t.relatedEntityId),
]);

// ─── Bank Credentials (per org — Santander mTLS) ───
export const bankCredentials = pgTable("bank_credentials", {
  id: id(),
  orgId: orgId(),
  provider: varchar("provider", { length: 50 }).default("santander").notNull(),
  environment: varchar("environment", { length: 20 }).default("sandbox").notNull(), // sandbox | production
  clientId: varchar("client_id", { length: 255 }).notNull(),
  clientSecret: varchar("client_secret", { length: 255 }).notNull(),
  workspaceId: varchar("workspace_id", { length: 255 }),
  certPath: varchar("cert_path", { length: 500 }), // relative to certs/ root
  keyPath: varchar("key_path", { length: 500 }),  // relative to certs/ root
  baseUrl: varchar("base_url", { length: 500 }).default("https://trust-sandbox.api.santander.com.br").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastHealthCheck: timestamp("last_health_check", { withTimezone: true }),
  lastHealthStatus: varchar("last_health_status", { length: 20 }), // healthy | degraded | down
  ...timestamps(),
}, (t) => [
  uniqueIndex("bank_credentials_org_provider_idx").on(t.orgId, t.provider),
  index("bank_credentials_org_id_idx").on(t.orgId),
]);

// ─── Integration Connectors ───
export const integrationConnectors = pgTable("integration_connectors", {
  id: id(),
  orgId: orgId(),
  providerName: varchar("provider_name", { length: 100 }).notNull(),
  capabilities: jsonb("capabilities").$type<string[]>().default([]),
  authMode: varchar("auth_mode", { length: 20 }).default("apikey").notNull(),
  retryPolicy: jsonb("retry_policy").$type<{
    maxAttempts: number;
    backoffMs: number;
  }>().default({ maxAttempts: 3, backoffMs: 1000 }),
  lastSyncStatus: varchar("last_sync_status", { length: 20 }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  ...timestamps(),
});

// ─── Documents ───
export const documents = pgTable("documents", {
  id: id(),
  orgId: orgId(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  source: varchar("source", { length: 50 }).notNull(),
  storageReference: varchar("storage_reference", { length: 500 }),
  parsedStatus: varchar("parsed_status", { length: 20 }).default("pending").notNull(),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }),
  parsedData: jsonb("parsed_data").$type<Record<string, unknown>>(),
  ...timestamps(),
}, (t) => [
  index("documents_entity_idx").on(t.entityType, t.entityId),
]);
