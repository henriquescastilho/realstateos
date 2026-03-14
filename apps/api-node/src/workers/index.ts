/**
 * Background worker registry.
 *
 * Starts all BullMQ workers when the process is launched with NODE_ENV !== "test".
 * Falls back gracefully if bullmq / ioredis is not installed.
 *
 * Queues:
 *   - billing-generation    : monthly charge generation for all active contracts
 *   - payment-reminders     : D-3 payment reminder notifications
 *   - dlq-processing        : dead-letter queue retry / human escalation
 *   - report-generation     : async PDF/CSV report jobs
 *   - vector-embedding      : embed new contract/maintenance text for semantic search
 */

export * from "./billing";
export * from "./reminders";
export * from "./dlq";
export * from "./reports";
export * from "./embeddings";

import { startBillingWorker } from "./billing";
import { startRemindersWorker } from "./reminders";
import { startDlqWorker } from "./dlq";
import { startReportsWorker } from "./reports";
import { startEmbeddingsWorker } from "./embeddings";

export function startAllWorkers(): void {
  startBillingWorker();
  startRemindersWorker();
  startDlqWorker();
  startReportsWorker();
  startEmbeddingsWorker();
  console.log("[workers] All background workers started");
}
