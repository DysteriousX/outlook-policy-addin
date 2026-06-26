"use strict";
/**
 * config.ts
 *
 * Central configuration for the recipient policy validator backend.
 * Contains customizable regular expressions to scan PDF text for policy IDs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.POLICY_ID_PATTERNS = void 0;
exports.POLICY_ID_PATTERNS = [
    // Pattern 1: POL followed optional dash and digits (e.g., POL123456, POL-98765)
    /POL-?(\d+)/i,
    // Pattern 2: "Policy Number" / "Policy/ Certificate number" / "Application/ Policy number" followed by alphanumeric value containing at least one digit
    /(?:Policy|Certificate|Application)\s*(?:\/\s*(?:Certificate|Policy))?\s*(?:Number|No\.?|#)?\s*:?\s*([a-z\d-]*\d[a-z\d-]*)/i,
    // Pattern 3: Standalone alphanumeric policy numbers starting with letters (e.g. BGDP241000301-01-000, K000234148)
    /\b([a-z]{1,4}\d{6,12}(?:-[a-z\d]+)*)\b/i,
    // Pattern 4: Standalone sequence of digits with dashes (e.g., 102-2503351, 200-0028388)
    /\b(\d{2,4}-\d{5,8})\b/,
    // Pattern 5: Standalone sequence of 5 to 8 digits (often used as fallback for raw IDs)
    /\b(\d{5,8})\b/
];
//# sourceMappingURL=config.js.map