import { NextFunction, Request, Response } from "express";

// NOTE: The in-memory rate limiter below is per-process. In a multi-instance
// (horizontally scaled) deployment, each instance maintains its own bucket map,
// so the effective rate limit per client is maxRequests * instanceCount.
// For multi-instance deployments, replace with a Redis-backed solution such as
// `rate-limiter-flexible` pointing to a shared Redis cluster.

type RateLimitOptions = {
  maxRequests: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitEntry>();

function getClientKey(req: Request) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || "unknown";
}

function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

export function applySecurityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

  // HSTS — only meaningful over HTTPS; safe to send in production only
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  // CSP — report-only to catch violations without breaking the app initially
  res.setHeader(
    "Content-Security-Policy-Report-Only",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'"
  );

  next();
}

export function createRateLimiter({ maxRequests, windowMs }: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    pruneExpiredBuckets(now);

    const key = `${req.path}:${getClientKey(req)}`;
    const current = rateLimitBuckets.get(key);

    if (!current || current.resetAt <= now) {
      rateLimitBuckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return next();
    }

    current.count += 1;
    rateLimitBuckets.set(key, current);

    if (current.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: "Too many requests. Please try again later.",
      });
    }

    return next();
  };
}
