import { isIP } from "node:net";

type Bucket = {
  count: number;
  resetAt: number;
};

type FixedWindowOptions = {
  limit: number;
  maxKeys: number;
  now?: () => number;
  windowMs: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly limit: number;
  private readonly maxKeys: number;
  private readonly now: () => number;
  private readonly windowMs: number;
  private operations = 0;
  private overflowBucket: Bucket | undefined;

  constructor({ limit, maxKeys, now = Date.now, windowMs }: FixedWindowOptions) {
    if (!Number.isInteger(limit) || limit <= 0) throw new Error("limit must be a positive integer");
    if (!Number.isInteger(maxKeys) || maxKeys <= 0) throw new Error("maxKeys must be a positive integer");
    if (!Number.isInteger(windowMs) || windowMs <= 0) throw new Error("windowMs must be a positive integer");

    this.limit = limit;
    this.maxKeys = maxKeys;
    this.now = now;
    this.windowMs = windowMs;
  }

  consume(key: string): RateLimitDecision {
    const now = this.now();
    this.operations += 1;
    if (this.operations % 128 === 0) this.prune(now);

    let bucket = this.buckets.get(key);
    if (bucket && bucket.resetAt <= now) {
      this.buckets.delete(key);
      bucket = undefined;
    }

    if (!bucket && this.buckets.size >= this.maxKeys) {
      this.prune(now);
      if (this.buckets.size >= this.maxKeys) {
        return this.consumeOverflow(now);
      }
    }

    if (!bucket) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }

    return this.consumeBucket(bucket, now);
  }

  private consumeBucket(bucket: Bucket, now: number): RateLimitDecision {
    const allowed = bucket.count < this.limit;
    if (allowed) bucket.count += 1;

    return {
      allowed,
      limit: this.limit,
      remaining: Math.max(0, this.limit - bucket.count),
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    };
  }

  private consumeOverflow(now: number): RateLimitDecision {
    if (!this.overflowBucket || this.overflowBucket.resetAt <= now) {
      this.overflowBucket = { count: 0, resetAt: now + this.windowMs };
    }

    return this.consumeBucket(this.overflowBucket, now);
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }

    if (this.overflowBucket && this.overflowBucket.resetAt <= now) {
      this.overflowBucket = undefined;
    }
  }
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export function getPilotRateLimitConfig(environment: NodeJS.ProcessEnv = process.env) {
  return {
    authLimit: boundedInteger(environment.RATE_LIMIT_AUTH_MAX, 60, 10, 1_000),
    businessLimit: boundedInteger(environment.RATE_LIMIT_BUSINESS_MAX, 600, 50, 10_000),
    windowMs: boundedInteger(environment.RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000)
  };
}

function normalizedIp(value: string | null) {
  const candidate = value?.split(",", 1)[0]?.trim();
  return candidate && candidate.length <= 64 && isIP(candidate) !== 0
    ? candidate.toLowerCase()
    : null;
}

export function getClientRateLimitKey(headers: Headers) {
  // This trust boundary is valid only while Docker publishes the app on
  // loopback and Tailscale Funnel is the sole external reverse proxy.
  return normalizedIp(headers.get("x-forwarded-for"))
    ?? normalizedIp(headers.get("x-real-ip"))
    ?? "unidentified";
}

type RateLimiters = {
  auth: FixedWindowRateLimiter;
  business: FixedWindowRateLimiter;
  signature: string;
};

type RateLimitGlobal = typeof globalThis & {
  __patryogaRateLimiters?: RateLimiters;
};

function getRateLimiters() {
  const config = getPilotRateLimitConfig();
  const signature = `${config.authLimit}:${config.businessLimit}:${config.windowMs}`;
  const rateLimitGlobal = globalThis as RateLimitGlobal;

  if (rateLimitGlobal.__patryogaRateLimiters?.signature !== signature) {
    rateLimitGlobal.__patryogaRateLimiters = {
      auth: new FixedWindowRateLimiter({
        limit: config.authLimit,
        maxKeys: 2_048,
        windowMs: config.windowMs
      }),
      business: new FixedWindowRateLimiter({
        limit: config.businessLimit,
        maxKeys: 4_096,
        windowMs: config.windowMs
      }),
      signature
    };
  }

  return rateLimitGlobal.__patryogaRateLimiters;
}

export function enforcePilotRateLimit(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/health") return null;

  const limiters = getRateLimiters();
  const limiter = pathname === "/api/auth" || pathname.startsWith("/api/auth/")
    ? limiters.auth
    : pathname.startsWith("/api/")
      ? limiters.business
      : null;

  if (!limiter) return null;

  const decision = limiter.consume(getClientRateLimitKey(request.headers));
  if (decision.allowed) return null;

  return Response.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(decision.retryAfterSeconds),
        "X-RateLimit-Limit": String(decision.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(decision.resetAt / 1000))
      }
    }
  );
}
