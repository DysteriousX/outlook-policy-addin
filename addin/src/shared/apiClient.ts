/**
 * apiClient.ts
 * Thin HTTP client for the backend validation & override API.
 * Reads BACKEND_BASE_URL from the webpack-injected global (set at build time).
 */

import type {
  ValidateRequest,
  ValidateResponse,
  OverrideRequest,
  OverrideResponse,
} from "./types";

// Injected by webpack DefinePlugin at build time (see webpack.config.js).
// Falls back to localhost for local development.
declare const BACKEND_BASE_URL: string;
const BASE_URL =
  typeof BACKEND_BASE_URL !== "undefined"
    ? BACKEND_BASE_URL
    : "http://localhost:3001";

/**
 * Obtain an SSO token via Office.auth.getAccessToken.
 * If SSO fails (e.g. in environments that don't support it) we fall back to
 * an empty string and let the backend decide whether to reject.
 */
async function getSsoToken(): Promise<string> {
  try {
    const token = await Office.auth.getAccessToken({
      allowSignInPrompt: true,
      allowConsentPrompt: true,
    });
    return token;
  } catch (err) {
    console.warn("[apiClient] SSO token acquisition failed:", err);
    return "";
  }
}

/**
 * Build common fetch headers including the SSO bearer token.
 */
async function buildHeaders(): Promise<HeadersInit> {
  const token = await getSsoToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * POST /validate
 * Sends recipient list + attachment metadata to the backend.
 * Throws a user-friendly Error on network/HTTP failure.
 */
export async function validateRecipients(
  payload: ValidateRequest
): Promise<ValidateResponse> {
  const headers = await buildHeaders();

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/validate`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw new Error(
      `Unable to reach the validation service. ` +
        `Please check your connection or contact support.\n(${networkErr})`
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(
      `Validation service returned an error (HTTP ${response.status}): ${text}`
    );
  }

  const data = (await response.json()) as ValidateResponse;
  return data;
}

/**
 * POST /override
 * Records a user-authorised override for a previous validation.
 * Throws a user-friendly Error on failure.
 */
export async function submitOverride(
  payload: OverrideRequest
): Promise<OverrideResponse> {
  const headers = await buildHeaders();

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/override`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw new Error(
      `Unable to reach the override service. ` +
        `Please check your connection or contact support.\n(${networkErr})`
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(
      `Override service returned an error (HTTP ${response.status}): ${text}`
    );
  }

  const data = (await response.json()) as OverrideResponse;
  return data;
}

/**
 * GET /result/:auditRef
 * Fetches a previously-computed validation result from the backend.
 */
export async function getValidationResult(
  auditRef: string
): Promise<ValidateResponse> {
  const headers = await buildHeaders();

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/result/${auditRef}`, {
      method: "GET",
      headers,
    });
  } catch (networkErr) {
    throw new Error(
      `Unable to reach the validation service. ` +
        `Please check your connection or contact support.\n(${networkErr})`
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(
      `Validation service returned an error (HTTP ${response.status}): ${text}`
    );
  }

  const data = (await response.json()) as ValidateResponse;
  return data;
}
