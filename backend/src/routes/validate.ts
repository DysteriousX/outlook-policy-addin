/**
 * validate.ts — POST /validate route
 *
 * Accepts: ValidateRequest (recipients[] + attachments[])
 * Returns: ValidateResponse (overallStatus, auditRef, attachmentResults[])
 */

import { Router, Request, Response } from "express";
import { validate, PasswordRequiredError } from "../services/validator";
import { policyAdminClient } from "../services/policyAdminClient";
import { storeResult, storePendingRequest, getPendingRequest } from "../services/resultStore";
import type { ValidateRequest, ValidateResponse } from "../types";
import { randomUUID } from "crypto";

export const validateRouter = Router();

validateRouter.post("/validate", async (req: Request, res: Response) => {
  const body = req.body as ValidateRequest;

  // ── Password-protected validation request ─────────────────────────────────
  if (body.auditRef && typeof body.password === "string") {
    const pendingReq = getPendingRequest(body.auditRef);
    if (!pendingReq) {
      res.status(404).json({ error: "Audit reference not found or expired." });
      return;
    }

    try {
      const result = await validate(pendingReq, policyAdminClient, body.password);

      // Cache the result for retrieval by the dialog via auditRef.
      storeResult(result);

      console.info(
        `[/validate] Re-validated auditRef=${result.auditRef} ` +
        `status=${result.overallStatus} ` +
        `recipients=${pendingReq.recipients?.length ?? 0} ` +
        `attachments=${pendingReq.attachments?.length ?? 0} ` +
        `user=${req.userUpn ?? "anonymous"}`
      );

      res.status(200).json(result);
      return;
    } catch (err: any) {
      if (
        err instanceof PasswordRequiredError ||
        (err && (err.name === "PasswordRequiredError" || err.message?.toLowerCase().includes("password")))
      ) {
        res.status(400).json({ error: "INCORRECT_PASSWORD" });
        return;
      }
      console.error("[/validate] Internal error during password validation:", err);
      res.status(500).json({ error: "Internal server error during validation." });
      return;
    }
  }

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
    if (err instanceof PasswordRequiredError) {
      const auditRef = `AUD-${randomUUID().slice(0, 8).toUpperCase()}`;
      const response: ValidateResponse = {
        overallStatus: "PASSWORD_REQUIRED",
        auditRef,
        attachmentResults: body.attachments.map((att) => ({
          id: att.id,
          name: att.name,
          policyId: att.policyId,
          status: "REVIEW",
          authorisedEmails: [],
          mismatchedRecipients: [],
          reason: att.name === err.attachmentName ? "Password required" : undefined,
        })),
      };

      storePendingRequest(auditRef, body, response);
      res.status(200).json(response);
      return;
    }
    console.error("[/validate] Internal error:", err);
    res.status(500).json({ error: "Internal server error during validation." });
  }
});
