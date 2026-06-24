/**
 * validator.ts
 * Core validation logic — pure functions, no Express dependencies.
 * Easily unit-testable (see test/validator.test.ts).
 */

import { randomUUID } from "crypto";
import pdf = require("pdf-parse");
import { POLICY_ID_PATTERNS } from "../config";
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

/**
 * Attempt to extract a policy ID from text content using the configured patterns.
 */
export function extractPolicyIdFromText(text: string): string | undefined {
  for (const pattern of POLICY_ID_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  return undefined;
}

// ─── Attachment validation ─────────────────────────────────────────────────────
/**
 * Validate a single attachment against the list of recipients.
 *
 * Rules:
 *  - No policyId -> REVIEW
 *  - policyId found, all recipients in authorisedEmails -> PASS
 *  - policyId found, some recipients not in authorisedEmails -> FAIL
 */
export async function validateAttachment(
  attachment: AttachmentInput,
  normalisedRecipients: string[],
  client: PolicyAdminClient
): Promise<AttachmentResult> {
  let policyId = attachment.policyId;

  // If base64 content is provided and it's a PDF, try to extract policy ID from text content
  if (attachment.content && attachment.name.toLowerCase().endsWith(".pdf")) {
    try {
      const buffer = Buffer.from(attachment.content, "base64");
      const pdfData = await (pdf as any)(buffer);
      const text = pdfData.text;
      const textPolicyId = extractPolicyIdFromText(text);
      if (textPolicyId) {
        policyId = textPolicyId;
        console.info(`[validator] Extracted policy ID "${policyId}" from PDF text for ${attachment.name}`);
      }
    } catch (err) {
      console.warn(`[validator] Failed to parse PDF text for ${attachment.name}:`, err);
    }
  }

  const base = {
    id: attachment.id,
    name: attachment.name,
    policyId,
  };

  // No policyId found either in filename or text -> REVIEW.
  if (!policyId) {
    return {
      ...base,
      status: "REVIEW" as AttachmentStatus,
      authorisedEmails: [],
      mismatchedRecipients: [],
      reason: "No policy ID could be extracted from the attachment filename or content.",
    };
  }

  // Lookup authorised emails from the Policy Admin client.
  const authorisedEmails = await client.getAuthorisedEmails(policyId);

  // Unknown policy ID -> REVIEW (not enough info to FAIL definitively).
  if (authorisedEmails.length === 0) {
    return {
      ...base,
      status: "REVIEW" as AttachmentStatus,
      authorisedEmails: [],
      mismatchedRecipients: [],
      reason: `Policy ID "${policyId}" is not recognised in the policy system.`,
    };
  }

  // Determine mismatched recipients.
  const authorisedSet = new Set(authorisedEmails.map(normaliseEmail));
  const mismatchedRecipients = normalisedRecipients.filter(
    (r) => !authorisedSet.has(normaliseEmail(r))
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
