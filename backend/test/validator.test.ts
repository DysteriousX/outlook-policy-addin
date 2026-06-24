/**
 * validator.test.ts
 * Unit tests for the backend validation service.
 * Run: npm test  (from backend/)
 */

import {
  normaliseEmail,
  validateAttachment,
  aggregateStatus,
  validate,
  extractPolicyIdFromText,
} from "../src/services/validator";
import type { PolicyAdminClient } from "../src/services/policyAdminClient";
import type { AttachmentInput, AttachmentResult } from "../src/types";

// Mock pdf-parse to return the buffer contents as text directly for easy test verification
jest.mock("pdf-parse", () => {
  return jest.fn().mockImplementation((buffer: Buffer) => {
    return Promise.resolve({ text: buffer.toString("utf8") });
  });
});

// ─── Mock Policy Admin Client ─────────────────────────────────────────────────
const mockClient: PolicyAdminClient = {
  getAuthorisedEmails: jest.fn(async (policyId: string): Promise<string[]> => {
    const map: Record<string, string[]> = {
      "123456": ["holder1@example.com"],
      "98765":  ["holder2@example.com", "holder2.alt@example.com"],
    };
    return map[policyId] ?? [];
  }),
};

beforeEach(() => jest.clearAllMocks());

// ─── normaliseEmail ───────────────────────────────────────────────────────────
describe("normaliseEmail", () => {
  it("lowercases an email", () => {
    expect(normaliseEmail("HOLDER1@EXAMPLE.COM")).toBe("holder1@example.com");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normaliseEmail("  holder1@example.com  ")).toBe("holder1@example.com");
  });

  it("handles already normalised email", () => {
    expect(normaliseEmail("holder1@example.com")).toBe("holder1@example.com");
  });
});

// ─── aggregateStatus ─────────────────────────────────────────────────────────
describe("aggregateStatus", () => {
  const makeResult = (status: "PASS" | "FAIL" | "REVIEW"): AttachmentResult => ({
    id: "1",
    name: "test.pdf",
    status,
    authorisedEmails: [],
    mismatchedRecipients: [],
  });

  it("returns PASS when all attachments pass", () => {
    expect(aggregateStatus([makeResult("PASS"), makeResult("PASS")])).toBe("PASS");
  });

  it("returns FAIL if any attachment fails", () => {
    expect(aggregateStatus([makeResult("PASS"), makeResult("FAIL")])).toBe("FAIL");
  });

  it("FAIL takes precedence over REVIEW", () => {
    expect(
      aggregateStatus([makeResult("REVIEW"), makeResult("FAIL"), makeResult("PASS")])
    ).toBe("FAIL");
  });

  it("returns REVIEW if any REVIEW and no FAIL", () => {
    expect(aggregateStatus([makeResult("PASS"), makeResult("REVIEW")])).toBe("REVIEW");
  });

  it("returns PASS for empty array (no attachments)", () => {
    // Edge case: no attachments → aggregate of empty is PASS
    // (the validate() function handles the empty case separately)
    expect(aggregateStatus([])).toBe("PASS");
  });
});

// ─── validateAttachment ───────────────────────────────────────────────────────
describe("validateAttachment", () => {
  const recipients = ["holder1@example.com"];

  it("returns REVIEW when no policyId", async () => {
    const att: AttachmentInput = { id: "a1", name: "invoice.pdf", size: 1000 };
    const result = await validateAttachment(att, recipients, mockClient);
    expect(result.status).toBe("REVIEW");
    expect(result.policyId).toBeUndefined();
    expect(mockClient.getAuthorisedEmails).not.toHaveBeenCalled();
  });

  it("returns REVIEW for unrecognised policyId", async () => {
    const att: AttachmentInput = {
      id: "a2",
      name: "POL999999_doc.pdf",
      size: 500,
      policyId: "999999",
    };
    const result = await validateAttachment(att, recipients, mockClient);
    expect(result.status).toBe("REVIEW");
    expect(result.authorisedEmails).toHaveLength(0);
  });

  it("returns PASS when all recipients are authorised", async () => {
    const att: AttachmentInput = {
      id: "a3",
      name: "POL123456_summary.pdf",
      size: 2000,
      policyId: "123456",
    };
    const result = await validateAttachment(att, ["holder1@example.com"], mockClient);
    expect(result.status).toBe("PASS");
    expect(result.mismatchedRecipients).toHaveLength(0);
    expect(result.authorisedEmails).toEqual(["holder1@example.com"]);
  });

  it("returns FAIL when a recipient is not authorised", async () => {
    const att: AttachmentInput = {
      id: "a4",
      name: "POL123456_summary.pdf",
      size: 2000,
      policyId: "123456",
    };
    const result = await validateAttachment(
      att,
      ["holder1@example.com", "intruder@evil.com"],
      mockClient
    );
    expect(result.status).toBe("FAIL");
    expect(result.mismatchedRecipients).toContain("intruder@evil.com");
    expect(result.mismatchedRecipients).not.toContain("holder1@example.com");
  });

  it("is case-insensitive for recipient matching", async () => {
    const att: AttachmentInput = {
      id: "a5",
      name: "POL123456_summary.pdf",
      size: 2000,
      policyId: "123456",
    };
    // Recipients provided in mixed case should still match.
    const result = await validateAttachment(
      att,
      ["HOLDER1@EXAMPLE.COM"], // uppercase recipient
      mockClient
    );
    expect(result.status).toBe("PASS");
    expect(result.mismatchedRecipients).toHaveLength(0);
  });

  it("handles multiple authorised emails (policyId 98765)", async () => {
    const att: AttachmentInput = {
      id: "a6",
      name: "Policy-98765.docx",
      size: 3000,
      policyId: "98765",
    };
    const result = await validateAttachment(
      att,
      ["holder2@example.com", "holder2.alt@example.com"],
      mockClient
    );
    expect(result.status).toBe("PASS");
  });
});

// ─── validate (top-level) ─────────────────────────────────────────────────────
describe("validate", () => {
  it("returns REVIEW for no attachments", async () => {
    const result = await validate(
      { recipients: ["holder1@example.com"], attachments: [] },
      mockClient
    );
    expect(result.overallStatus).toBe("REVIEW");
    expect(result.auditRef).toMatch(/^AUD-/);
  });

  it("returns PASS when all attachments pass", async () => {
    const result = await validate(
      {
        recipients: ["holder1@example.com"],
        attachments: [
          { id: "1", name: "POL123456_doc.pdf", size: 100, policyId: "123456" },
        ],
      },
      mockClient
    );
    expect(result.overallStatus).toBe("PASS");
    expect(result.attachmentResults[0].status).toBe("PASS");
  });

  it("returns FAIL when a recipient is not authorised", async () => {
    const result = await validate(
      {
        recipients: ["holder1@example.com", "badguy@example.com"],
        attachments: [
          { id: "1", name: "POL123456_doc.pdf", size: 100, policyId: "123456" },
        ],
      },
      mockClient
    );
    expect(result.overallStatus).toBe("FAIL");
    expect(result.attachmentResults[0].mismatchedRecipients).toContain(
      "badguy@example.com"
    );
  });

  it("returns REVIEW when one attachment has no policyId", async () => {
    const result = await validate(
      {
        recipients: ["holder1@example.com"],
        attachments: [
          { id: "1", name: "POL123456_doc.pdf", size: 100, policyId: "123456" },
          { id: "2", name: "random_file.pdf", size: 50 }, // no policyId
        ],
      },
      mockClient
    );
    expect(result.overallStatus).toBe("REVIEW");
  });

  it("generates a unique auditRef per call", async () => {
    const r1 = await validate(
      { recipients: ["holder1@example.com"], attachments: [] },
      mockClient
    );
    const r2 = await validate(
      { recipients: ["holder1@example.com"], attachments: [] },
      mockClient
    );
    expect(r1.auditRef).not.toBe(r2.auditRef);
  });

  it("normalises recipient case before comparison", async () => {
    const result = await validate(
      {
        recipients: ["HOLDER1@EXAMPLE.COM"],
        attachments: [
          { id: "1", name: "POL123456_doc.pdf", size: 100, policyId: "123456" },
        ],
      },
      mockClient
    );
    expect(result.overallStatus).toBe("PASS");
  });

  describe("extractPolicyIdFromText", () => {
    it("extracts from POL123456 format", () => {
      expect(extractPolicyIdFromText("This is document POL123456")).toBe("123456");
      expect(extractPolicyIdFromText("This is document POL-98765")).toBe("98765");
    });

    it("extracts from Policy Number formats", () => {
      expect(extractPolicyIdFromText("Policy Number: 123456")).toBe("123456");
      expect(extractPolicyIdFromText("Policy No. 98765")).toBe("98765");
      expect(extractPolicyIdFromText("Policy# 123456")).toBe("123456");
    });

    it("extracts from fallback standalone digit sequences", () => {
      expect(extractPolicyIdFromText("Reference ID 98765 is active")).toBe("98765");
    });

    it("returns undefined when no policy ID matches", () => {
      expect(extractPolicyIdFromText("Hello world 123")).toBeUndefined();
    });
  });

  describe("PDF content validation fallback", () => {
    it("reads policy ID from PDF content if not in filename", async () => {
      const att: AttachmentInput = {
        id: "pdf-content-test",
        name: "invoice.pdf", // no policyId in filename
        size: 5000,
        content: Buffer.from("This email contains policy detail for Policy No: 123456").toString("base64"),
      };

      const result = await validateAttachment(
        att,
        ["holder1@example.com"],
        mockClient
      );

      expect(result.status).toBe("PASS");
      expect(result.policyId).toBe("123456");
    });
  });
});
