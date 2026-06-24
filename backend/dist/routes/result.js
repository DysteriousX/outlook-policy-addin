"use strict";
/**
 * result.ts — GET /result/:auditRef
 *
 * Returns a previously-computed validation result by auditRef.
 * Called by the dialog page on load to avoid relying on messageChild.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resultRouter = void 0;
const express_1 = require("express");
const resultStore_1 = require("../services/resultStore");
exports.resultRouter = (0, express_1.Router)();
exports.resultRouter.get("/result/:auditRef", (req, res) => {
    const { auditRef } = req.params;
    if (!auditRef) {
        res.status(400).json({ error: "auditRef is required." });
        return;
    }
    const result = (0, resultStore_1.getResult)(auditRef);
    if (!result) {
        res.status(404).json({
            error: `No result found for auditRef "${auditRef}". It may have expired (30-min TTL).`,
        });
        return;
    }
    res.status(200).json(result);
});
//# sourceMappingURL=result.js.map