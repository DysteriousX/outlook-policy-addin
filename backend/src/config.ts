/**
 * config.ts
 *
 * Central configuration for the recipient policy validator backend.
 * Contains customizable regular expressions to scan PDF text for policy IDs.
 */

export const POLICY_ID_PATTERNS: RegExp[] = [
  // Pattern 1: POL followed optional dash and digits (e.g., POL123456, POL-98765)
  /POL-?(\d+)/i,

  // Pattern 2: "Policy Number" / "Policy No" / "Policy #" / "Policy:" followed by digits
  /Policy\s*(?:Number|No|#)?\s*:?\s*(\d+)/i,

  // Pattern 3: Standalone sequence of 5 to 8 digits (often used as fallback for raw IDs)
  /\b(\d{5,8})\b/
];
