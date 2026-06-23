/**
 * override.ts — POST /override route
 *
 * Accepts: OverrideRequest (auditRef, reasonCode, reasonText, confirmedByUser)
 * Returns: OverrideResponse (overrideRef, auditRef, recordedAt)
 *
 * MVP: stores override events in memory.
 * Production: replace the in-memory store with a database write.
 */

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import type { OverrideRequest, OverrideRecord } from "../types";

export const overrideRouter = Router();

// ── In-memory override store (MVP) ────────────────────────────────────────────
// Production: replace with a DB call (Postgres, Cosmos DB, etc.)
const overrideStore: Map<string, OverrideRecord> = new Map();

/** Exposed for testing only. */
export function _getOverrideStore(): Map<string, OverrideRecord> {
  return overrideStore;
}

// ─────────────────────────────────────────────────────────────────────────────
overrideRouter.post("/override", (req: Request, res: Response) => {
  const body = req.body as OverrideRequest;

  // ── Input validation ────────────────────────────────────────────────────────
  if (!body.auditRef || typeof body.auditRef !== "string") {
    res.status(400).json({ error: "auditRef is required." });
    return;
  }
  if (!body.reasonCode || typeof body.reasonCode !== "string") {
    res.status(400).json({ error: "reasonCode is required." });
    return;
  }
  if (!body.reasonText || typeof body.reasonText !== "string") {
    res.status(400).json({ error: "reasonText is required." });
    return;
  }
  if (body.confirmedByUser !== true) {
    res.status(400).json({ error: "confirmedByUser must be true." });
    return;
  }

  // ── Record override ─────────────────────────────────────────────────────────
  const overrideRef = `OVR-${randomUUID().slice(0, 8).toUpperCase()}`;
  const recordedAt = new Date().toISOString();

  const record: OverrideRecord = {
    overrideRef,
    auditRef: body.auditRef,
    reasonCode: body.reasonCode,
    reasonText: body.reasonText,
    confirmedByUser: body.confirmedByUser,
    recordedAt,
    userUpn: req.userUpn,
  };

  overrideStore.set(overrideRef, record);

  console.info(
    `[/override] overrideRef=${overrideRef} ` +
    `auditRef=${body.auditRef} ` +
    `reasonCode=${body.reasonCode} ` +
    `user=${req.userUpn ?? "anonymous"}`
  );

  res.status(201).json({
    overrideRef,
    auditRef: body.auditRef,
    recordedAt,
  });
});
