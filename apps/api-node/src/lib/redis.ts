import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let _redis: IORedis | undefined;

/**
 * Lazy-initialized Redis connection (same pattern as db/index.ts).
 */
export function getRedis(): IORedis {
  if (!_redis) {
    _redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });
    _redis.on("error", (err) => {
      console.error("[redis] Connection error:", err.message);
    });
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = undefined;
  }
}
