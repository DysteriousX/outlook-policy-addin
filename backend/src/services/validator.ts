/**
 * validator.ts
 * Core validation logic — pure functions, no Express dependencies.
 * Easily unit-testable (see test/validator.test.ts).
 */

import { randomUUID } from "crypto";
import type {
  AttachmentInput,
  AttachmentResult,
  AttachmentStatus,
  OverallStatus,
  ValidateRequest,
  ValidateResponse,
} from "../types";
import type { PolicyAdminClient } from "./policyAdminClient";

// ─── Normalisation helper ─────────────────────────────────────────────────────
/**
 * Normalise an email: lowercase + trim.
 * Handles nullish inputs defensively.
 */
export function normaliseEmail(email: string): string {
  return email.toLowerCase().trim();
}

// ─── Attachment validation ─────────────────────────────────────────────────────
/**
 * Validate a single attachment against the list of recipients.
 *
 * Rules:
 *  - No policyId → REVIEW
 *  - policyId found, all recipients in authorisedEmails → PASS
 *  - policyId found, some recipients not in authorisedEmails → FAIL
 */
export async function validateAttachment(
  attachment: AttachmentInput,
  normalisedRecipients: string[],
  client: PolicyAdminClient
): Promise<AttachmentResult> {
  const base = {
    id: attachment.id,
    name: attachment.name,
    policyId: attachment.policyId,
  };

  // No policyId extracted from filename → REVIEW.
  if (!attachment.policyId) {
    return {
      ...base,
      status: "REVIEW" as AttachmentStatus,
      authorisedEmails: [],
      mismatchedRecipients: [],
      reason: "No policy ID could be extracted from the attachment filename.",
    };
  }

  // Lookup authorised emails from the Policy Admin client.
  const authorisedEmails = await client.getAuthorisedEmails(attachment.policyId);

  // Unknown policy ID → REVIEW (not enough info to FAIL definitively).
  if (authorisedEmails.length === 0) {
    return {
      ...base,
      status: "REVIEW" as AttachmentStatus,
      authorisedEmails: [],
      mismatchedRecipients: [],
      reason: `Policy ID "${attachment.policyId}" is not recognised in the policy system.`,
    };
  }

  // Determine mismatched recipients.
  const authorisedSet = new Set(authorisedEmails.map(normaliseEmail));
  const mismatchedRecipients = normalisedRecipients.filter(
    (r) => !authorisedSet.has(r)
  );

  const status: AttachmentStatus =
    mismatchedRecipients.length === 0 ? "PASS" : "FAIL";

  return {
    ...base,
    status,
    authorisedEmails,
    mismatchedRecipients,
  };
}

// ─── Overall status aggregation ───────────────────────────────────────────────
/**
 * Derive the overall status from individual attachment results.
 *
 * Rules:
 *  - Any FAIL → overall FAIL
 *  - Any REVIEW (and no FAIL) → overall REVIEW
 *  - All PASS → overall PASS
 */
export function aggregateStatus(results: AttachmentResult[]): OverallStatus {
  if (results.some((r) => r.status === "FAIL")) return "FAIL";
  if (results.some((r) => r.status === "REVIEW")) return "REVIEW";
  return "PASS";
}

// ─── Top-level validate ────────────────────────────────────────────────────────
/**
 * Validate all recipients against all attachments.
 * Returns a full ValidateResponse with audit reference.
 */
export async function validate(
  request: ValidateRequest,
  client: PolicyAdminClient
): Promise<ValidateResponse> {
  // Normalise recipients once.
  const normalisedRecipients = request.recipients.map(normaliseEmail);

  // Validate all attachments in parallel.
  const attachmentResults = await Promise.all(
    request.attachments.map((att) =>
      validateAttachment(att, normalisedRecipients, client)
    )
  );

  // Edge case: no attachments → REVIEW (nothing to validate against).
  if (attachmentResults.length === 0) {
    return {
      overallStatus: "REVIEW",
      auditRef: `AUD-${randomUUID().slice(0, 8).toUpperCase()}`,
      attachmentResults: [],
    };
  }

  const overallStatus = aggregateStatus(attachmentResults);
  const auditRef = `AUD-${randomUUID().slice(0, 8).toUpperCase()}`;

  return { overallStatus, auditRef, attachmentResults };
}
