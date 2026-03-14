import { Queue } from "bullmq";
import { getRedis } from "./redis";

export const QUEUE_NAMES = {
  MESSAGES: "messages",
  AGENT_TASKS: "agent-tasks",
  EVENTS: "events",
  INGESTION: "ingestion",
} as const;

const queues = new Map<string, Queue>();

function getQueue(name: string): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: getRedis() });
    queues.set(name, queue);
  }
  return queue;
}

export const messagesQueue = () => getQueue(QUEUE_NAMES.MESSAGES);
export const agentTasksQueue = () => getQueue(QUEUE_NAMES.AGENT_TASKS);
export const eventsQueue = () => getQueue(QUEUE_NAMES.EVENTS);
export const ingestionQueue = () => getQueue(QUEUE_NAMES.INGESTION);

export async function closeQueues(): Promise<void> {
  for (const queue of queues.values()) {
    await queue.close();
  }
  queues.clear();
}
