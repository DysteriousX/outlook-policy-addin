/**
 * backend/src/types.ts
 * Shared TypeScript types for the backend service.
 */

export interface AttachmentInput {
  id: string;
  name: string;
  size: number;
  policyId?: string;
  content?: string; // base64 encoded pdf content
}

export interface ValidateRequest {
  recipients: string[];
  attachments: AttachmentInput[];
}

export type AttachmentStatus = "PASS" | "FAIL" | "REVIEW";

export interface AttachmentResult {
  id: string;
  name: string;
  policyId?: string;
  status: AttachmentStatus;
  authorisedEmails: string[];
  mismatchedRecipients: string[];
  reason?: string;
}

export type OverallStatus = "PASS" | "FAIL" | "REVIEW";

export interface ValidateResponse {
  overallStatus: OverallStatus;
  auditRef: string;
  attachmentResults: AttachmentResult[];
}

export interface OverrideRequest {
  auditRef: string;
  reasonCode: string;
  reasonText: string;
  confirmedByUser: boolean;
}

export interface OverrideResponse {
  overrideRef: string;
  auditRef: string;
  recordedAt: string;
}

export interface OverrideRecord extends OverrideResponse {
  reasonCode: string;
  reasonText: string;
  confirmedByUser: boolean;
  userUpn?: string;
}
