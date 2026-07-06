import "server-only";

type RedisSetOptions = {
  ex?: number;
};

const memoryStore = new Map<string, { value: string; expiresAt: number | null }>();

function memoryGet(key: string): string | null {
  const row = memoryStore.get(key);
  if (!row) return null;
  if (row.expiresAt != null && Date.now() > row.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return row.value;
}

function memorySet(key: string, value: string, options?: RedisSetOptions): void {
  const expiresAt =
    options?.ex != null ? Date.now() + options.ex * 1000 : null;
  memoryStore.set(key, { value, expiresAt });
}

function upstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

async function upstashCommand<T>(command: unknown[]): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL!.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!.trim();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    throw new Error(`Redis command failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { result?: T; error?: string };
  if (json.error) {
    throw new Error(`Redis error: ${json.error}`);
  }
  return json.result as T;
}

export function isRedisConfigured(): boolean {
  return upstashConfigured();
}

/** Server-side Redis accessor — Upstash REST when configured, in-memory fallback for local dev. */
export const redis = {
  async get(key: string): Promise<string | null> {
    if (!upstashConfigured()) {
      return memoryGet(key);
    }
    const result = await upstashCommand<string | null>(["GET", key]);
    return result ?? null;
  },

  async set(key: string, value: string, options?: RedisSetOptions): Promise<void> {
    if (!upstashConfigured()) {
      memorySet(key, value, options);
      return;
    }
    if (options?.ex != null) {
      await upstashCommand(["SET", key, value, "EX", options.ex]);
      return;
    }
    await upstashCommand(["SET", key, value]);
  },

  /** SET key value NX EX ttl — returns true when the lock/key was acquired. */
  async setNx(
    key: string,
    value: string,
    options?: RedisSetOptions,
  ): Promise<boolean> {
    if (!upstashConfigured()) {
      if (memoryGet(key) != null) return false;
      memorySet(key, value, options);
      return true;
    }
    const command: unknown[] = ["SET", key, value, "NX"];
    if (options?.ex != null) {
      command.push("EX", options.ex);
    }
    const result = await upstashCommand<string | null>(command);
    return result === "OK";
  },

  async del(key: string): Promise<void> {
    if (!upstashConfigured()) {
      memoryStore.delete(key);
      return;
    }
    await upstashCommand(["DEL", key]);
  },

  /**
   * Reset the TTL on an existing key without changing its value.
   * No-op if the key does not exist.
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (!upstashConfigured()) {
      const row = memoryStore.get(key);
      if (row) {
        memoryStore.set(key, { value: row.value, expiresAt: Date.now() + ttlSeconds * 1000 });
      }
      return;
    }
    await upstashCommand(["EXPIRE", key, ttlSeconds]);
  },
};
