/**
 * dialog.ts
 * Runs inside the Office dialog window (dialog.html).
 *
 * Lifecycle:
 *  1. Office.onReady fires → dialog sends "READY" to parent (not needed for MVP).
 *  2. Parent sends DialogInboundMessage via dialog.messageChild() →
 *     Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, ...)
 *     receives it.
 *  3. User fills override form → submits → calls /override → sends result back
 *     via Office.context.ui.messageParent().
 */

import { getValidationResult } from "../shared/apiClient";
import type {
  ValidateResponse,
  AttachmentResult,
  DialogInboundMessage,
  DialogOutboundMessage,
} from "../shared/types";

// ─── State ────────────────────────────────────────────────────────────────────
let currentValidation: ValidateResponse | null = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
Office.onReady(() => {
  setupParentMessageHandler();
  setupCloseHandlers();
  loadResultFromQueryParam();
});

// ─── Query param loader ────────────────────────────────────────────────────────
async function loadResultFromQueryParam(): Promise<void> {
  const urlParams = new URLSearchParams(window.location.search);
  const auditRef = urlParams.get("auditRef");
  if (!auditRef) return;

  // If already received via messageChild, no need to fetch.
  if (currentValidation) return;

  try {
    const data = await getValidationResult(auditRef);
    if (!currentValidation) {
      currentValidation = data;
      renderValidationResult(data);
    }
  } catch (err) {
    // Only show error if we haven't successfully received data via messageChild fallback.
    if (!currentValidation) {
      console.error("[dialog] Failed to fetch validation result from backend:", err);
      showDialogError(
        err instanceof Error
          ? err.message
          : "Failed to load validation details from the server."
      );
    }
  }
}

// ─── Parent message handler ────────────────────────────────────────────────────
function setupParentMessageHandler(): void {
  // Listen for data sent from commands.ts via dialog.messageChild().
  Office.context.ui.addHandlerAsync(
    Office.EventType.DialogParentMessageReceived,
    (args: { message: string; origin: string | undefined }) => {
      try {
        const msg = JSON.parse(args.message) as DialogInboundMessage;
        if (msg.type === "VALIDATION_RESULT") {
          if (!currentValidation) {
            currentValidation = msg.payload;
            renderValidationResult(msg.payload);
          }
        }
      } catch (e) {
        console.error("[dialog] Failed to parse parent message:", e);
        showDialogError("Failed to load validation data.");
      }
    },
    (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        console.error("[dialog] addHandlerAsync failed:", result.error);
      }
    }
  );
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function renderValidationResult(data: ValidateResponse): void {
  // Show loading state is done — hide spinner, show content.
  hideById("loading-section");
  showById("content-section");

  // Overall status badge.
  const statusEl = getEl("overall-status");
  statusEl.textContent = data.overallStatus;
  statusEl.className = `status-badge status-${data.overallStatus.toLowerCase()}`;

  // Audit reference.
  getEl("audit-ref").textContent = data.auditRef;

  // Per-attachment table.
  renderAttachmentTable(data.attachmentResults);
}

function renderAttachmentTable(results: AttachmentResult[]): void {
  const tbody = getEl("attachment-tbody");
  tbody.innerHTML = "";

  if (results.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="empty-row">No attachments found.</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const r of results) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="td-name" title="${escHtml(r.name)}">${escHtml(truncate(r.name, 28))}</td>
      <td>${escHtml(r.policyId ?? "—")}</td>
      <td><span class="status-badge status-${r.status.toLowerCase()}">${escHtml(r.status)}</span></td>
      <td class="td-emails">${escHtml(r.authorisedEmails.join(", ") || "—")}</td>
      <td class="td-emails mismatched">${escHtml(r.mismatchedRecipients.join(", ") || "—")}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ─── Form handlers ────────────────────────────────────────────────────────────
// ─── Close handlers ──────────────────────────────────────────────────────────
function setupCloseHandlers(): void {
  const closeBtn = document.getElementById("close-btn");
  closeBtn?.addEventListener("click", handleClose);

  const bottomCloseBtn = document.getElementById("bottom-close-btn");
  bottomCloseBtn?.addEventListener("click", handleClose);
}

function handleClose(): void {
  const msg: DialogOutboundMessage = { type: "DIALOG_CLOSED" };
  Office.context.ui.messageParent(JSON.stringify(msg));
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────
function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found in dialog DOM.`);
  return el;
}

function showById(id: string): void {
  const el = document.getElementById(id);
  if (el) el.style.display = "";
}

function hideById(id: string): void {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}

function showDialogError(msg: string): void {
  hideById("loading-section");
  showById("content-section");
  const errEl = document.getElementById("global-error");
  if (errEl) {
    errEl.textContent = msg;
    errEl.style.display = "block";
  }
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}
