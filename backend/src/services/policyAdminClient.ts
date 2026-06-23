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

// ─── Hardcoded MVP mapping ────────────────────────────────────────────────────
const POLICY_EMAIL_MAP: Record<string, string[]> = {
  "123456": ["holder1@example.com"],
  "98765":  ["holder2@example.com", "holder2.alt@example.com"],
};

export interface PolicyAdminClient {
  getAuthorisedEmails(policyId: string): Promise<string[]>;
}

/**
 * Stubbed implementation — returns hardcoded authorised emails.
 * Returns an empty array if the policyId is not recognised.
 */
export const policyAdminClient: PolicyAdminClient = {
  async getAuthorisedEmails(policyId: string): Promise<string[]> {
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
