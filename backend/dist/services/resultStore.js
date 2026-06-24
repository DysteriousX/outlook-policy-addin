"use strict";
/**
 * resultStore.ts
 * Shared in-memory store for validation results.
 * Allows the dialog (served from the add-in dev server) to fetch results
 * by auditRef without relying on Office.js messageChild / DialogParentMessageReceived.
 *
 * Production: replace with a short-TTL Redis/DB store.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeResult = storeResult;
exports.storePendingRequest = storePendingRequest;
exports.getPendingRequest = getPendingRequest;
exports.getResult = getResult;
// TTL: keep results for 30 minutes, then evict to avoid unbounded growth.
const TTL_MS = 30 * 60 * 1000;
const store = new Map();
function storeResult(result) {
    const existing = store.get(result.auditRef);
    store.set(result.auditRef, {
        data: result,
        request: existing?.request, // Preserve request if it was cached
        expiresAt: Date.now() + TTL_MS,
    });
}
function storePendingRequest(auditRef, request, response) {
    store.set(auditRef, {
        data: response,
        request,
        expiresAt: Date.now() + TTL_MS,
    });
}
function getPendingRequest(auditRef) {
    const entry = store.get(auditRef);
    if (!entry)
        return undefined;
    if (Date.now() > entry.expiresAt) {
        store.delete(auditRef);
        return undefined;
    }
    return entry.request;
}
function getResult(auditRef) {
    const entry = store.get(auditRef);
    if (!entry)
        return undefined;
    if (Date.now() > entry.expiresAt) {
        store.delete(auditRef);
        return undefined;
    }
    return entry.data;
}
//# sourceMappingURL=resultStore.js.map