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
exports.getResult = getResult;
// TTL: keep results for 30 minutes, then evict to avoid unbounded growth.
const TTL_MS = 30 * 60 * 1000;
const store = new Map();
function storeResult(result) {
    store.set(result.auditRef, {
        data: result,
        expiresAt: Date.now() + TTL_MS,
    });
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