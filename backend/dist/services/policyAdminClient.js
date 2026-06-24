"use strict";
/**
 * policyAdminClient.ts
 * Stub Policy Admin API client.
 *
 * In production, replace the hardcoded mapping with real HTTP calls to the
 * Policy Administration System (PAS), e.g.:
 *   const response = await fetch(`${PAS_BASE_URL}/policies/${policyId}/holders`);
 *
 * All emails are stored and returned in lowercase for consistent comparison.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.policyAdminClient = void 0;
// ─── Hardcoded MVP mapping ────────────────────────────────────────────────────
const POLICY_EMAIL_MAP = {
    "123456": ["holder1@example.com"],
    "98765": ["holder2@example.com", "holder2.alt@example.com"],
};
/**
 * Stubbed implementation — returns hardcoded authorised emails.
 * Returns an empty array if the policyId is not recognised.
 */
exports.policyAdminClient = {
    async getAuthorisedEmails(policyId) {
        // Simulate network latency in development (optional).
        // await new Promise(resolve => setTimeout(resolve, 50));
        const emails = POLICY_EMAIL_MAP[policyId];
        if (!emails) {
            console.warn(`[policyAdminClient] No policy found for id="${policyId}"`);
            return [];
        }
        // Return a fresh copy with emails already normalised (lowercase + trimmed).
        return emails.map((e) => e.toLowerCase().trim());
    },
};
//# sourceMappingURL=policyAdminClient.js.map