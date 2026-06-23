/**
 * index.ts — Express server entry point.
 *
 * Starts on PORT (default 3001).
 * Routes: POST /validate, POST /override
 * Middleware: CORS (localhost dev), JSON body parser, auth (MVP token extract).
 */

import express from "express";
import cors from "cors";
import { validateRouter } from "./routes/validate";
import { overrideRouter } from "./routes/override";
import { resultRouter } from "./routes/result";
import { extractToken } from "./middleware/auth";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// ── CORS ──────────────────────────────────────────────────────────────────────
// In production, restrict this to your specific add-in domain.
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests from localhost (add-in dev server) or no origin (Postman).
      if (
        !origin ||
        origin.startsWith("https://localhost") ||
        origin.startsWith("http://localhost")
      ) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin "${origin}" not allowed`));
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ── Body parser ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));

// ── Auth middleware (MVP — parse token, no signature verification) ─────────────
app.use(extractToken);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/", validateRouter);
app.use("/", overrideRouter);
app.use("/", resultRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[server] Unhandled error:", err);
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Backend server listening on http://localhost:${PORT}`);
  console.log(`   POST http://localhost:${PORT}/validate`);
  console.log(`   POST http://localhost:${PORT}/override`);
  console.log(`   GET  http://localhost:${PORT}/health`);
});

export { app }; // exported for testing
