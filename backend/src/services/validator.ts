/**
 * validator.ts
 * Core validation logic — pure functions, no Express dependencies.
 * Easily unit-testable (see test/validator.test.ts).
 */

import { randomUUID } from "crypto";
import AdmZip from "adm-zip";
import { PDFParse, PasswordException } from "pdf-parse";
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

export function extractPolicyIdFromFilename(filename: string): string | undefined {
  const patterns = [
    /POL(\d+)/i,
    /Policy[-_](\d+)/i,
    /(\d{5,})/,
  ];
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

export class PasswordRequiredError extends Error {
  constructor(public attachmentName: string, public zipEntryName?: string) {
    super(
      `Attachment "${attachmentName}"${
        zipEntryName ? ` (file: ${zipEntryName})` : ""
      } is password-protected and requires a password.`
    );
    this.name = "PasswordRequiredError";
  }
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
async function validateSinglePolicy(
  id: string,
  name: string,
  policyId: string | undefined,
  normalisedRecipients: string[],
  client: PolicyAdminClient
): Promise<AttachmentResult> {
  const base = { id, name, policyId };

  if (!policyId) {
    return {
      ...base,
      status: "REVIEW",
      authorisedEmails: [],
      mismatchedRecipients: [],
      reason: "No policy ID could be extracted from the attachment filename or content.",
    };
  }

  const authorisedEmails = await client.getAuthorisedEmails(policyId);
  if (authorisedEmails.length === 0) {
    return {
      ...base,
      status: "REVIEW",
      authorisedEmails: [],
      mismatchedRecipients: [],
      reason: `Policy ID "${policyId}" is not recognised in the policy system.`,
    };
  }

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

export async function validateAttachment(
  attachment: AttachmentInput,
  normalisedRecipients: string[],
  client: PolicyAdminClient,
  password?: string
): Promise<AttachmentResult[]> {
  const base = {
    id: attachment.id,
    name: attachment.name,
  };

  // Case A: ZIP attachment content parsing
  if (attachment.content && attachment.name.toLowerCase().endsWith(".zip")) {
    const results: AttachmentResult[] = [];
    try {
      const zipBuffer = Buffer.from(attachment.content, "base64");
      const zip = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();

      for (const entry of zipEntries) {
        if (!entry.isDirectory) {
          const entryPolicyIdFromFilename = extractPolicyIdFromFilename(entry.name);
          let entryPolicyId = entryPolicyIdFromFilename;
          const isPdf = entry.name.toLowerCase().endsWith(".pdf");

          // Only process this entry if it's a PDF or has a policy ID in its filename
          if (isPdf || entryPolicyId) {
            if (isPdf) {
              const pdfBuffer = entry.getData();
              try {
                const parser = new PDFParse({
                  data: pdfBuffer,
                  password: password
                });
                const pdfData = await parser.getText();
                const text = pdfData.text;
                const textPolicyId = extractPolicyIdFromText(text);
                if (textPolicyId) {
                  entryPolicyId = textPolicyId;
                }
              } catch (err: any) {
                if (err instanceof PasswordException || (err && (err.name === "PasswordException" || err.message?.toLowerCase().includes("password")))) {
                  throw new PasswordRequiredError(attachment.name, entry.name);
                }
                console.warn(`[validator] Failed to parse PDF "${entry.name}" inside ZIP ${attachment.name}:`, err);
              }
            }

            // Validate this specific file inside the ZIP
            const entryResult = await validateSinglePolicy(
              `${attachment.id}/${entry.name}`,
              `${attachment.name} / ${entry.name}`,
              entryPolicyId,
              normalisedRecipients,
              client
            );
            results.push(entryResult);
          }
        }
      }
    } catch (err: any) {
      if (err instanceof PasswordRequiredError) {
        throw err;
      }
      console.warn(`[validator] Failed to read ZIP content for ${attachment.name}:`, err);
    }

    if (results.length > 0) {
      return results;
    }

    // Fallback if no files inside ZIP were processed
    return [
      {
        ...base,
        policyId: undefined,
        status: "REVIEW",
        authorisedEmails: [],
        mismatchedRecipients: [],
        reason: "No policy documents found inside the ZIP archive.",
      }
    ];
  }

  // Case B: Non-ZIP attachment (e.g. PDF or other)
  const policyIds = new Set<string>();
  if (attachment.policyId) {
    policyIds.add(attachment.policyId);
  } else {
    const namePolicyId = extractPolicyIdFromFilename(attachment.name);
    if (namePolicyId) {
      policyIds.add(namePolicyId);
    }
  }

  if (attachment.content && attachment.name.toLowerCase().endsWith(".pdf")) {
    try {
      const buffer = Buffer.from(attachment.content, "base64");
      const parser = new PDFParse({
        data: buffer,
        password: password
      });
      const pdfData = await parser.getText();
      const text = pdfData.text;
      const textPolicyId = extractPolicyIdFromText(text);
      if (textPolicyId) {
        policyIds.add(textPolicyId);
      }
    } catch (err: any) {
      if (err instanceof PasswordException || (err && (err.name === "PasswordException" || err.message?.toLowerCase().includes("password")))) {
        throw new PasswordRequiredError(attachment.name);
      }
      console.warn(`[validator] Failed to parse PDF text for ${attachment.name}:`, err);
    }
  }

  const pids = Array.from(policyIds);
  const singlePolicyId = pids.length > 0 ? pids[0] : undefined;

  const result = await validateSinglePolicy(
    attachment.id,
    attachment.name,
    singlePolicyId,
    normalisedRecipients,
    client
  );

  return [result];
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
  client: PolicyAdminClient,
  password?: string
): Promise<ValidateResponse> {
  if (!Array.isArray(request.recipients) || !Array.isArray(request.attachments)) {
    throw new Error("Invalid validation request: missing recipients or attachments.");
  }
  // Normalise recipients once.
  const normalisedRecipients = request.recipients.map(normaliseEmail);

  // Validate all attachments in parallel.
  const attachmentResultGroups = await Promise.all(
    request.attachments.map((att) =>
      validateAttachment(att, normalisedRecipients, client, password)
    )
  );

  const attachmentResults = attachmentResultGroups.flat();

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
