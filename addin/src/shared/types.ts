// ─── Shared Types ────────────────────────────────────────────────────────────
// These types are shared conceptually between the add-in and backend.
// The backend has its own copy under backend/src/types.ts.

export interface AttachmentInput {
  id: string;
  name: string;
  size: number;
  policyId?: string;
  content?: string; // base64 encoded pdf content
}

export interface ValidateRequest {
  recipients?: string[];
  attachments?: AttachmentInput[];
  auditRef?: string;
  password?: string;
}

// ─── Per-attachment result ────────────────────────────────────────────────────
export type AttachmentStatus = "PASS" | "FAIL" | "REVIEW";

export interface AttachmentResult {
  id: string;
  name: string;
  policyId?: string;
  status: AttachmentStatus;
  authorisedEmails: string[];
  mismatchedRecipients: string[];
  reason?: string; // e.g. "no policyId found"
}

// ─── Overall validation result ────────────────────────────────────────────────
export type OverallStatus = "PASS" | "FAIL" | "REVIEW" | "PASSWORD_REQUIRED";

export interface ValidateResponse {
  overallStatus: OverallStatus;
  auditRef: string;
  attachmentResults: AttachmentResult[];
}

// ─── Override request/response ────────────────────────────────────────────────
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

// ─── Dialog message protocol ──────────────────────────────────────────────────
// commands.ts → dialog: sent via dialog.messageChild()
export interface DialogInboundMessage {
  type: "VALIDATION_RESULT";
  payload: ValidateResponse;
}

// dialog → commands.ts: sent via Office.context.ui.messageParent()
export interface DialogOutboundMessage {
  type: "OVERRIDE_SUCCESS" | "DIALOG_CLOSED";
  overrideRef?: string;
}
