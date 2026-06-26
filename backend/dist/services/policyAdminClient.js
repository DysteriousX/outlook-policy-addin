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