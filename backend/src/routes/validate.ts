/**
 * validate.ts — POST /validate route
 *
 * Accepts: ValidateRequest (recipients[] + attachments[])
 * Returns: ValidateResponse (overallStatus, auditRef, attachmentResults[])
 */

import { Router, Request, Response } from "express";
import { validate } from "../services/validator";
import { policyAdminClient } from "../services/policyAdminClient";
import { storeResult } from "../services/resultStore";
import type { ValidateRequest } from "../types";

export const validateRouter = Router();

validateRouter.post("/validate", async (req: Request, res: Response) => {
  const body = req.body as ValidateRequest;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    res.status(400).json({
      error: "recipients must be a non-empty array of email strings.",
    });
    return;
  }

  if (!Array.isArray(body.attachments)) {
    res.status(400).json({
      error: "attachments must be an array.",
    });
    return;
  }

  // Ensure each recipient is a string.
  const invalidRecipient = body.recipients.find(
    (r) => typeof r !== "string"
  );
  if (invalidRecipient !== undefined) {
    res.status(400).json({ error: "Each recipient must be a string." });
    return;
  }

  try {
    const result = await validate(body, policyAdminClient);

    // Cache the result for retrieval by the dialog via auditRef.
    storeResult(result);

    console.info(
      `[/validate] auditRef=${result.auditRef} ` +
      `status=${result.overallStatus} ` +
      `recipients=${body.recipients.length} ` +
      `attachments=${body.attachments.length} ` +
      `user=${req.userUpn ?? "anonymous"}`
    );

    res.status(200).json(result);
  } catch (err) {
    console.error("[/validate] Internal error:", err);
    res.status(500).json({ error: "Internal server error during validation." });
  }
});
