"use strict";
/**
 * index.ts — Express server entry point.
 *
 * Starts on PORT (default 3001).
 * Routes: POST /validate, POST /override
 * Middleware: CORS (localhost dev), JSON body parser, auth (MVP token extract).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const validate_1 = require("./routes/validate");
const override_1 = require("./routes/override");
const result_1 = require("./routes/result");
const auth_1 = require("./middleware/auth");
const app = (0, express_1.default)();
exports.app = app;
const PORT = parseInt(process.env.PORT ?? "3001", 10);
// ── CORS ──────────────────────────────────────────────────────────────────────
// In production, restrict this to your specific add-in domain.
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests from localhost (add-in dev server) or no origin (Postman).
        if (!origin ||
            origin.startsWith("https://localhost") ||
            origin.startsWith("http://localhost")) {
            callback(null, true);
        }
        else {
            callback(new Error(`CORS: origin "${origin}" not allowed`));
        }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
// ── Body parser ───────────────────────────────────────────────────────────────
app.use(express_1.default.json({ limit: "1mb" }));
// ── Auth middleware (MVP — parse token, no signature verification) ─────────────
app.use(auth_1.extractToken);
// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/", validate_1.validateRouter);
app.use("/", override_1.overrideRouter);
app.use("/", result_1.resultRouter);
// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
});
// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error("[server] Unhandled error:", err);
    res.status(500).json({ error: err.message ?? "Internal server error" });
});
// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ Backend server listening on http://localhost:${PORT}`);
    console.log(`   POST http://localhost:${PORT}/validate`);
    console.log(`   POST http://localhost:${PORT}/override`);
    console.log(`   GET  http://localhost:${PORT}/health`);
});
//# sourceMappingURL=index.js.map