/**
 * result.ts — GET /result/:auditRef
 *
 * Returns a previously-computed validation result by auditRef.
 * Called by the dialog page on load to avoid relying on messageChild.
 */

import { Router, Request, Response } from "express";
import { getResult } from "../services/resultStore";

export const resultRouter = Router();

resultRouter.get("/result/:auditRef", (req: Request, res: Response) => {
  const { auditRef } = req.params;

  if (!auditRef) {
    res.status(400).json({ error: "auditRef is required." });
    return;
  }

  const result = getResult(auditRef);

  if (!result) {
    res.status(404).json({
      error: `No result found for auditRef "${auditRef}". It may have expired (30-min TTL).`,
    });
    return;
  }

  res.status(200).json(result);
});
