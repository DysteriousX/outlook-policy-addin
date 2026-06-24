"use strict";
/**
 * validate.ts — POST /validate route
 *
 * Accepts: ValidateRequest (recipients[] + attachments[])
 * Returns: ValidateResponse (overallStatus, auditRef, attachmentResults[])
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRouter = void 0;
const express_1 = require("express");
const validator_1 = require("../services/validator");
const policyAdminClient_1 = require("../services/policyAdminClient");
const resultStore_1 = require("../services/resultStore");
exports.validateRouter = (0, express_1.Router)();
exports.validateRouter.post("/validate", async (req, res) => {
    const body = req.body;
    // ── Input validation ──────────────────────────────────────────────────────
    if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
        res.status(400).json({
            error: "recipients must be a non-empty array of email strings.",
        });
        return;
    }
    if (!Array.isArray(body.attachments)) {
        res.status(400).json({
            error: "attachments must be an array.",
        });
        return;
    }
    // Ensure each recipient is a string.
    const invalidRecipient = body.recipients.find((r) => typeof r !== "string");
    if (invalidRecipient !== undefined) {
        res.status(400).json({ error: "Each recipient must be a string." });
        return;
    }
    try {
        const result = await (0, validator_1.validate)(body, policyAdminClient_1.policyAdminClient);
        // Cache the result for retrieval by the dialog via auditRef.
        (0, resultStore_1.storeResult)(result);
        console.info(`[/validate] auditRef=${result.auditRef} ` +
            `status=${result.overallStatus} ` +
            `recipients=${body.recipients.length} ` +
            `attachments=${body.attachments.length} ` +
            `user=${req.userUpn ?? "anonymous"}`);
        res.status(200).json(result);
    }
    catch (err) {
        console.error("[/validate] Internal error:", err);
        res.status(500).json({ error: "Internal server error during validation." });
    }
});
//# sourceMappingURL=validate.js.map