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
  PasswordRequiredError,
} from "../src/services/validator";
import type { PolicyAdminClient } from "../src/services/policyAdminClient";
import type { AttachmentInput, AttachmentResult } from "../src/types";

// Mock pdf-parse named exports to return buffer text or raise PasswordException
class MockPasswordException extends Error {
  constructor(message?: string) {
    super(message || "Password exception");
    this.name = "PasswordException";
  }
}

jest.mock("pdf-parse", () => {
  class PasswordException extends Error {
    constructor(message?: string) {
      super(message || "Password exception");
      this.name = "PasswordException";
    }
  }

  return {
    PasswordException,
    PDFParse: jest.fn().mockImplementation((options: { data: Buffer; password?: string }) => {
      return {
        getText: async () => {
          const text = options.data.toString("utf8");
          if (text.includes("PASSWORD_PROTECTED")) {
            if (options.password !== "correct_password") {
              throw new PasswordException();
            }
            return { text: "This is decrypted text with Policy No: 123456" };
          }
          return { text };
        }
      };
    })
  };
});

jest.mock("adm-zip", () => {
  return jest.fn().mockImplementation((buffer: Buffer) => {
    return {
      getEntries: () => {
        try {
          const entries = JSON.parse(buffer.toString("utf8"));
          if (Array.isArray(entries)) {
            return entries.map((e) => ({
              name: e.name,
              isDirectory: !!e.isDirectory,
              getData: () => Buffer.from(e.content, "utf8"),
            }));
          }
        } catch (err) {
          // ignore
        }
        return [];
      },
    };
  });
});

// ─── Mock Policy Admin Client ─────────────────────────────────────────────────
const mockClient: PolicyAdminClient = {
  getAuthorisedEmails: jest.fn(async (policyId: string): Promise<string[]> => {
    const map: Record<string, string[]> = {
      "123456": ["holder1@example.com"],
      "98765":  ["holder2@example.com", "holder2.alt@example.com"],
      "31483805": ["oan.chimseng@example.com", "holder1@example.com"],
      "102-2503351": ["tan.yunhao.alson@example.com", "holder2@example.com"],
      "11507168": ["gouw.tamadavidpriatna@example.com", "holder1@example.com"],
      "11519001": ["lim.zaiwang@example.com", "holder1@example.com"],
      "11553719": ["chan.puikinbenny@example.com", "holder2@example.com"],
      "31247362": ["qiu.meiyan@example.com", "holder1@example.com"],
      "50216834": ["ooi.khailin@example.com", "holder1@example.com"],
      "BGDP241000301-01-000": ["guohao.goh@example.com", "holder2@example.com"],
      "200-0028388": ["lee.samuelyikai@example.com", "holder1@example.com"],
      "K000234148": ["lee.samuelyikai@example.com", "holder1@example.com"],
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
    expect(result[0].status).toBe("REVIEW");
    expect(result[0].policyId).toBeUndefined();
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
    expect(result[0].status).toBe("REVIEW");
    expect(result[0].authorisedEmails).toHaveLength(0);
  });

  it("returns PASS when all recipients are authorised", async () => {
    const att: AttachmentInput = {
      id: "a3",
      name: "POL123456_summary.pdf",
      size: 2000,
      policyId: "123456",
    };
    const result = await validateAttachment(att, ["holder1@example.com"], mockClient);
    expect(result[0].status).toBe("PASS");
    expect(result[0].mismatchedRecipients).toHaveLength(0);
    expect(result[0].authorisedEmails).toEqual(["holder1@example.com"]);
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
    expect(result[0].status).toBe("FAIL");
    expect(result[0].mismatchedRecipients).toContain("intruder@evil.com");
    expect(result[0].mismatchedRecipients).not.toContain("holder1@example.com");
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
    expect(result[0].status).toBe("PASS");
    expect(result[0].mismatchedRecipients).toHaveLength(0);
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
    expect(result[0].status).toBe("PASS");
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

    it("extracts from image-derived policy number patterns", () => {
      // Image 1: Policy Number: 31483805
      expect(extractPolicyIdFromText("Policy Number:             31483805")).toBe("31483805");
      // Image 2: Policy number           : 102-2503351
      expect(extractPolicyIdFromText("Policy number           : 102-2503351")).toBe("102-2503351");
      // Image 3: Policy/ Certificate number   : 11507168 (HSBC Life Goal Builder-SGD 5P)
      expect(extractPolicyIdFromText("Policy/ Certificate number   : 11507168 (HSBC Life Goal Builder-SGD 5P)")).toBe("11507168");
      
      // Image 4: Policy Number : 11519001
      expect(extractPolicyIdFromText("Policy Number : 11519001")).toBe("11519001");
      // Image 5: Policy Number : 11553719
      expect(extractPolicyIdFromText("Policy Number\t: 11553719")).toBe("11553719");
      // Image 6: Policy No. : 31247362
      expect(extractPolicyIdFromText("Policy No. : 31247362")).toBe("31247362");

      // Image 7: Policy Number: 50216834
      expect(extractPolicyIdFromText("Policy Number:\n50216834")).toBe("50216834");
      // Image 8: Policy Number:  BGDP241000301-01-000
      expect(extractPolicyIdFromText("Policy Number:\nBGDP241000301-01-000")).toBe("BGDP241000301-01-000");
      // Image 9: Application / Policy number: 200-0028388 / K000234148
      expect(extractPolicyIdFromText("Application / Policy number: 200-0028388 / K000234148")).toBe("200-0028388");
    });

    it("extracts standalone alphanumeric and hyphenated policy IDs (Patterns 3 and 4)", () => {
      expect(extractPolicyIdFromText("This document references BGDP241000301-01-000 for verification")).toBe("BGDP241000301-01-000");
      expect(extractPolicyIdFromText("User id: K000234148")).toBe("K000234148");
      expect(extractPolicyIdFromText("Ref: 102-2503351")).toBe("102-2503351");
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

      expect(result[0].status).toBe("PASS");
      expect(result[0].policyId).toBe("123456");
    });
  });

  describe("Password protected PDF validation", () => {
    it("throws PasswordRequiredError when PDF is password protected and no password is provided", async () => {
      const att: AttachmentInput = {
        id: "pdf-password-test",
        name: "locked.pdf",
        size: 5000,
        content: Buffer.from("PASSWORD_PROTECTED content").toString("base64"),
      };

      await expect(
        validateAttachment(att, ["holder1@example.com"], mockClient)
      ).rejects.toThrow(PasswordRequiredError);
    });

    it("throws PasswordRequiredError when PDF is password protected and incorrect password is provided", async () => {
      const att: AttachmentInput = {
        id: "pdf-password-test",
        name: "locked.pdf",
        size: 5000,
        content: Buffer.from("PASSWORD_PROTECTED content").toString("base64"),
      };

      await expect(
        validateAttachment(att, ["holder1@example.com"], mockClient, "wrong_password")
      ).rejects.toThrow(PasswordRequiredError);
    });

    it("extracts policy ID when PDF is password protected and correct password is provided", async () => {
      const att: AttachmentInput = {
        id: "pdf-password-test",
        name: "locked.pdf",
        size: 5000,
        content: Buffer.from("PASSWORD_PROTECTED content").toString("base64"),
      };

      const result = await validateAttachment(
        att,
        ["holder1@example.com"],
        mockClient,
        "correct_password"
      );

      expect(result[0].status).toBe("PASS");
      expect(result[0].policyId).toBe("123456");
    });
  });

  describe("ZIP attachments validation", () => {
    it("extracts policy ID from entry filenames inside ZIP", async () => {
      const mockZipData = [
        { name: "POL123456_summary.pdf", content: "plain text" },
        { name: "random_image.png", content: "image data" }
      ];
      const att: AttachmentInput = {
        id: "zip-filename-test",
        name: "archive.zip",
        size: 2000,
        content: Buffer.from(JSON.stringify(mockZipData)).toString("base64"),
      };

      const result = await validateAttachment(
        att,
        ["holder1@example.com"],
        mockClient
      );

      expect(result[0].status).toBe("PASS");
      expect(result[0].policyId).toBe("123456");
      expect(result[0].authorisedEmails).toEqual(["holder1@example.com"]);
    });

    it("extracts policy ID from PDF content inside ZIP", async () => {
      const mockZipData = [
        { name: "invoice.pdf", content: "This is PDF content with Policy Number: 98765" }
      ];
      const att: AttachmentInput = {
        id: "zip-pdf-content-test",
        name: "archive.zip",
        size: 3000,
        content: Buffer.from(JSON.stringify(mockZipData)).toString("base64"),
      };

      const result = await validateAttachment(
        att,
        ["holder2@example.com"],
        mockClient
      );

      expect(result[0].status).toBe("PASS");
      expect(result[0].policyId).toBe("98765");
      expect(result[0].authorisedEmails).toContain("holder2@example.com");
    });

    it("validates recipients against multiple policy IDs found in ZIP", async () => {
      const mockZipData = [
        { name: "POL123456.pdf", content: "content" },
        { name: "doc.pdf", content: "contains Policy No 98765" }
      ];
      const att: AttachmentInput = {
        id: "zip-multi-policy",
        name: "archive.zip",
        size: 4000,
        content: Buffer.from(JSON.stringify(mockZipData)).toString("base64"),
      };

      const result = await validateAttachment(
        att,
        ["holder1@example.com", "holder2@example.com"],
        mockClient
      );
      expect(result).toHaveLength(2);
      expect(result[0].status).toBe("FAIL");
      expect(result[1].status).toBe("FAIL");
      expect(result[0].policyId).toBe("123456");
      expect(result[1].policyId).toBe("98765");
      expect(result[0].mismatchedRecipients).toContain("holder2@example.com");
      expect(result[1].mismatchedRecipients).toContain("holder1@example.com");
    });

    it("throws PasswordRequiredError when a PDF inside ZIP is password protected", async () => {
      const mockZipData = [
        { name: "locked.pdf", content: "PASSWORD_PROTECTED content" }
      ];
      const att: AttachmentInput = {
        id: "zip-locked-test",
        name: "archive.zip",
        size: 2000,
        content: Buffer.from(JSON.stringify(mockZipData)).toString("base64"),
      };

      await expect(
        validateAttachment(att, ["holder1@example.com"], mockClient)
      ).rejects.toThrow(PasswordRequiredError);
    });

    it("successfully decrypts locked PDF inside ZIP when correct password is provided", async () => {
      const mockZipData = [
        { name: "locked.pdf", content: "PASSWORD_PROTECTED content" }
      ];
      const att: AttachmentInput = {
        id: "zip-locked-test",
        name: "archive.zip",
        size: 2000,
        content: Buffer.from(JSON.stringify(mockZipData)).toString("base64"),
      };

      const result = await validateAttachment(
        att,
        ["holder1@example.com"],
        mockClient,
        "correct_password"
      );

      expect(result[0].status).toBe("PASS");
      expect(result[0].policyId).toBe("123456");
    });
  });
});
