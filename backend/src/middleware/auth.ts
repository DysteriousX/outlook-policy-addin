/**
 * auth.ts
 * MVP authentication middleware.
 *
 * In production, replace the body of verifyToken() with:
 *   - Fetch Microsoft JWKS: https://login.microsoftonline.com/common/discovery/v2.0/keys
 *   - Verify the JWT signature using the matching public key.
 *   - Validate iss, aud, exp, nbf, and appid claims.
 *   - Use a library like `jsonwebtoken` or `jose`.
 *
 * For MVP we parse the token's payload without verifying the signature,
 * which is safe ONLY for local development.
 */

import type { Request, Response, NextFunction } from "express";

// Augment Express Request to carry the decoded token subject.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userUpn?: string;
      userId?: string;
    }
  }
}

// ─── JWT payload parsing (MVP — no signature verification) ────────────────────
interface JwtPayload {
  sub?: string;
  upn?: string;
  preferred_username?: string;
  oid?: string;
  name?: string;
  exp?: number;
}

function parseJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // Base64url → Base64 → JSON.
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────
/**
 * extractToken — reads Bearer token from Authorization header.
 * Does NOT validate the token signature (MVP placeholder).
 * Attaches userUpn and userId to req for downstream logging.
 *
 * To add real validation:
 *  1. Install `jose`: npm install jose
 *  2. Fetch JWKS from Microsoft endpoint.
 *  3. Call `jwtVerify(token, JWKS, { issuer, audience })`.
 *  4. Return 401 if verification fails.
 */
export function extractToken(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // No token provided — allow request but without user context.
    // In production: return res.status(401).json({ error: "Unauthorised" });
    console.warn(
      `[auth] No Bearer token on ${req.method} ${req.path} (MVP: allowing)`
    );
    next();
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "
  const payload = parseJwtPayload(token);

  if (payload) {
    const upn =
      payload.upn ??
      payload.preferred_username ??
      payload.sub ??
      "unknown";
    const userId = payload.oid ?? payload.sub ?? "unknown";

    req.userUpn = upn;
    req.userId = userId;

    console.info(
      `[auth] Request from upn="${upn}" userId="${userId}" ` +
      `exp=${payload.exp ? new Date(payload.exp * 1000).toISOString() : "N/A"}`
    );
  } else {
    console.warn("[auth] Could not parse JWT payload.");
  }

  next();
}
