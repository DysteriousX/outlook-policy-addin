/**
 * resultStore.ts
 * Shared in-memory store for validation results.
 * Allows the dialog (served from the add-in dev server) to fetch results
 * by auditRef without relying on Office.js messageChild / DialogParentMessageReceived.
 *
 * Production: replace with a short-TTL Redis/DB store.
 */

import type { ValidateResponse, ValidateRequest } from "../types";

// TTL: keep results for 30 minutes, then evict to avoid unbounded growth.
const TTL_MS = 30 * 60 * 1000;

interface StoredResult {
  data: ValidateResponse;
  request?: ValidateRequest; // Saved request for password verification
  expiresAt: number;
}

const store = new Map<string, StoredResult>();

export function storeResult(result: ValidateResponse): void {
  const existing = store.get(result.auditRef);
  store.set(result.auditRef, {
    data: result,
    request: existing?.request, // Preserve request if it was cached
    expiresAt: Date.now() + TTL_MS,
  });
}

export function storePendingRequest(
  auditRef: string,
  request: ValidateRequest,
  response: ValidateResponse
): void {
  store.set(auditRef, {
    data: response,
    request,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function getPendingRequest(auditRef: string): ValidateRequest | undefined {
  const entry = store.get(auditRef);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(auditRef);
    return undefined;
  }
  return entry.request;
}

export function getResult(auditRef: string): ValidateResponse | undefined {
  const entry = store.get(auditRef);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(auditRef);
    return undefined;
  }
  return entry.data;
}
