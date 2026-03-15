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
  messageRecords,
  agentTasks,
  integrationConnectors,
  documents,
  webhookSubscriptions,
  eventLog,
  channelConfigs,
  inboundMessages,
  inboxThreads,
  inboxMessages,
  documentEmbeddings,
  chatConversations,
  chatMessages,
  agentConfigs,
  propertyExpenses,
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
export type MessageRecord = InferSelectModel<typeof messageRecords>;
export type AgentTask = InferSelectModel<typeof agentTasks>;
export type IntegrationConnector = InferSelectModel<typeof integrationConnectors>;
export type Document = InferSelectModel<typeof documents>;
export type WebhookSubscription = InferSelectModel<typeof webhookSubscriptions>;
export type EventLogEntry = InferSelectModel<typeof eventLog>;
export type ChannelConfig = InferSelectModel<typeof channelConfigs>;
export type InboundMessage = InferSelectModel<typeof inboundMessages>;
export type InboxThread = InferSelectModel<typeof inboxThreads>;
export type InboxMessage = InferSelectModel<typeof inboxMessages>;
export type DocumentEmbedding = InferSelectModel<typeof documentEmbeddings>;
export type ChatConversation = InferSelectModel<typeof chatConversations>;
export type ChatMessage = InferSelectModel<typeof chatMessages>;
export type AgentConfig = InferSelectModel<typeof agentConfigs>;
export type PropertyExpense = InferSelectModel<typeof propertyExpenses>;

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
export type NewMessageRecord = InferInsertModel<typeof messageRecords>;
export type NewAgentTask = InferInsertModel<typeof agentTasks>;
export type NewIntegrationConnector = InferInsertModel<typeof integrationConnectors>;
export type NewDocument = InferInsertModel<typeof documents>;
export type NewWebhookSubscription = InferInsertModel<typeof webhookSubscriptions>;
export type NewEventLogEntry = InferInsertModel<typeof eventLog>;
export type NewChannelConfig = InferInsertModel<typeof channelConfigs>;
export type NewInboundMessage = InferInsertModel<typeof inboundMessages>;
export type NewInboxThread = InferInsertModel<typeof inboxThreads>;
export type NewInboxMessage = InferInsertModel<typeof inboxMessages>;
export type NewDocumentEmbedding = InferInsertModel<typeof documentEmbeddings>;
export type NewChatConversation = InferInsertModel<typeof chatConversations>;
export type NewChatMessage = InferInsertModel<typeof chatMessages>;
export type NewAgentConfig = InferInsertModel<typeof agentConfigs>;
export type NewPropertyExpense = InferInsertModel<typeof propertyExpenses>;

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

export const AgentTaskStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  ESCALATED: "escalated",
  CANCELLED: "cancelled",
} as const;

export const BoletoStatus = {
  PENDING: "pending",
  GENERATED: "generated",
  FAILED: "failed",
} as const;

export const ReconciliationStatus = {
  UNMATCHED: "unmatched",
  MATCHED: "matched",
  PARTIAL: "partial",
  DIVERGENT: "divergent",
} as const;

export const InboxThreadStatus = {
  OPEN: "open",
  SNOOZED: "snoozed",
  CLOSED: "closed",
} as const;

export const PropertyExpenseStatus = {
  CAPTURED: "captured",
  APPROVED: "approved",
  PAID: "paid",
  REJECTED: "rejected",
} as const;

export const ExpenseType = {
  CONDO: "condo",
  IPTU: "iptu",
  TAXA: "taxa",
} as const;

export const DomainEventTypes = {
  CHARGE_CREATED: "charge.created",
  CHARGE_ISSUED: "charge.issued",
  CHARGE_OVERDUE: "charge.overdue",
  PAYMENT_RECEIVED: "payment.received",
  TICKET_OPENED: "ticket.opened",
  TICKET_RESOLVED: "ticket.resolved",
  STATEMENT_READY: "statement.ready",
  MESSAGE_SENT: "message.sent",
  MESSAGE_FAILED: "message.failed",
  MESSAGE_INBOUND: "message.inbound",
  EXPENSE_CAPTURED: "expense.captured",
  EXPENSE_APPROVED: "expense.approved",
  CHARGES_COMPOSED: "charges.composed",
  PAYOUT_BILLS_PAID: "payout.bills_paid",
  PAYOUT_COMPLETED: "payout.completed",
} as const;
