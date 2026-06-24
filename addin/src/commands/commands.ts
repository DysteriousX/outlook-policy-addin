/**
 * commands.ts
 * Entry point for the add-in ribbon command "Validate Recipients".
 *
 * Loaded by Outlook when a function command button is clicked.
 * Must call event.completed() in ALL code paths (success, error, timeout).
 */

import { validateRecipients } from "../shared/apiClient";
import type {
  AttachmentInput,
  ValidateResponse,
  DialogInboundMessage,
  DialogOutboundMessage,
} from "../shared/types";

Office.onReady(() => {
  // Register the handler so Outlook can invoke it from the ribbon button.
  // The function name MUST match the <FunctionName> in manifest.xml.
  (Office.actions as any).associate("ValidateRecipients", ValidateRecipients);
});

// ─── Policy-ID extraction ─────────────────────────────────────────────────────
/**
 * Attempt to extract a policyId from an attachment filename.
 *   "POL123456_summary.pdf"  → "123456"
 *   "Policy-98765.docx"      → "98765"
 *   "invoice.pdf"            → undefined
 */
function extractPolicyId(filename: string): string | undefined {
  const patterns = [
    /POL(\d+)/i,   // POL123456...
    /Policy[-_](\d+)/i, // Policy-98765 or Policy_98765
    /(\d{5,})/,    // fallback: first run of 5+ digits
  ];
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

// ─── Recipient helpers ────────────────────────────────────────────────────────
/**
 * Safely read recipients from a mailbox field.
 * Returns a Promise resolving to an array of normalised (lowercase+trim) emails.
 */
function getRecipientsFromField(
  field: Office.Recipients | null | undefined
): Promise<string[]> {
  return new Promise((resolve) => {
    if (!field) {
      resolve([]);
      return;
    }
    field.getAsync((result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        const emails = result.value.map((r) =>
          r.emailAddress.toLowerCase().trim()
        );
        resolve(emails);
      } else {
        console.warn("[commands] Failed to read recipients:", result.error);
        resolve([]);
      }
    });
  });
}

// ─── Attachment helper ────────────────────────────────────────────────────────
/**
 * Read attachments from the item.
 * Uses getAttachmentsAsync in compose mode, and item.attachments in read mode.
 */
function getAttachmentsFromItem(item: any): Promise<AttachmentInput[]> {
  return new Promise((resolve) => {
    // If in read mode, attachments are available synchronously.
    if (item.attachments && Array.isArray(item.attachments)) {
      const attachments: AttachmentInput[] = item.attachments.map((a: any) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        policyId: extractPolicyId(a.name),
      }));
      resolve(attachments);
      return;
    }

    // In compose mode, use getAttachmentsAsync.
    if (typeof item.getAttachmentsAsync === "function") {
      item.getAttachmentsAsync((result: any) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          const rawAttachments = result.value as Office.AttachmentDetails[];
          const attachments: AttachmentInput[] = rawAttachments.map((a) => ({
            id: a.id,
            name: a.name,
            size: a.size,
            policyId: extractPolicyId(a.name),
          }));
          resolve(attachments);
        } else {
          console.warn("[commands] Failed to read attachments:", result.error);
          resolve([]);
        }
      });
    } else {
      resolve([]);
    }
  });
}

/**
 * Safely read attachment content using Office.js.
 * Returns a Promise resolving to the Base64 string of the file.
 */
function getAttachmentContent(attachmentId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const item = Office.context.mailbox.item;
    if (!item || typeof item.getAttachmentContentAsync !== "function") {
      reject(new Error("getAttachmentContentAsync is not supported on this Outlook client."));
      return;
    }
    item.getAttachmentContentAsync(attachmentId, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        // result.value.content contains the base64 encoded string
        resolve(result.value.content);
      } else {
        reject(new Error(result.error.message || `Failed to read attachment ${attachmentId}`));
      }
    });
  });
}

// ─── Dialog URL helper ────────────────────────────────────────────────────────
/**
 * Build the absolute URL for the dialog page.
 * Office dialogs must use HTTPS (or http://localhost for dev).
 */
function getDialogUrl(auditRef: string): string {
  // __webpack_public_path__ is set to the dev server origin during dev.
  // In production this points to the hosted add-in origin.
  const origin = window.location.origin;
  return `${origin}/dialog/dialog.html?auditRef=${encodeURIComponent(auditRef)}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
/**
 * ValidateRecipients — ribbon button handler.
 * Reads To/Cc/Bcc and attachments, calls /validate, then shows result.
 */
export async function ValidateRecipients(
  event: Office.AddinCommands.Event
): Promise<void> {
  // Ensure event.completed() is always called.
  // We wrap everything and call completed() in finally.
  let completedCalled = false;
  const done = () => {
    if (!completedCalled) {
      completedCalled = true;
      event.completed();
    }
  };

  try {
    const item = Office.context.mailbox.item;
    if (!item) {
      showErrorNotification("No mail item is currently selected.");
      done();
      return;
    }

    // 1. Gather recipients from To / Cc / Bcc (handle nulls gracefully).
    const [toEmails, ccEmails, bccEmails] = await Promise.all([
      getRecipientsFromField(item.to),
      getRecipientsFromField(item.cc),
      getRecipientsFromField(item.bcc),
    ]);

    const allRecipients = [...new Set([...toEmails, ...ccEmails, ...bccEmails])];

    if (allRecipients.length === 0) {
      showErrorNotification(
        "No recipients found. Please add at least one recipient before validating."
      );
      done();
      return;
    }

    // 2. Read attachments list (asynchronous in compose mode).
    const attachments = await getAttachmentsFromItem(item);

    if (attachments.length === 0) {
      showErrorNotification(
        "No attachments found. Please attach at least one policy document before validating."
      );
      done();
      return;
    }

    // 3. Fetch Base64 PDF contents in parallel.
    const attachmentsWithContent = await Promise.all(
      attachments.map(async (att) => {
        if (att.name.toLowerCase().endsWith(".pdf")) {
          try {
            const content = await getAttachmentContent(att.id);
            return { ...att, content };
          } catch (e) {
            console.warn(`[commands] Failed to read content for attachment ${att.name}:`, e);
          }
        }
        return att;
      })
    );

    // 4. Call the backend.
    const validationResult: ValidateResponse = await validateRecipients({
      recipients: allRecipients,
      attachments: attachmentsWithContent,
    });

    // 4. Handle result.
    if (validationResult.overallStatus === "PASS") {
      showPassNotification(validationResult.auditRef);
      done();
    } else {
      // FAIL or REVIEW → open dialog.
      await openResultDialog(validationResult, item, done);
      // Note: done() is called inside openResultDialog after dialog closes.
    }
  } catch (err) {
    console.error("[ValidateRecipients] Unexpected error:", err);
    showErrorNotification(
      err instanceof Error
        ? err.message
        : "An unexpected error occurred during validation."
    );
    done();
  }
}

// ─── Notification helpers ─────────────────────────────────────────────────────
function showPassNotification(auditRef: string): void {
  Office.context.mailbox.item?.notificationMessages.replaceAsync("validate-result", {
    type: Office.MailboxEnums.ItemNotificationMessageType.InformationalMessage,
    message: `✅ Validation PASSED. Audit ref: ${auditRef}`,
    icon: "Icon.80x80",
    persistent: true,
  });
}

function showErrorNotification(message: string): void {
  Office.context.mailbox.item?.notificationMessages.replaceAsync("validate-result", {
    type: Office.MailboxEnums.ItemNotificationMessageType.ErrorMessage,
    message,
  });
}

function showOverrideNotification(overrideRef: string): void {
  Office.context.mailbox.item?.notificationMessages.replaceAsync("validate-result", {
    type: Office.MailboxEnums.ItemNotificationMessageType.InformationalMessage,
    message: `⚠️ Override recorded. Ref: ${overrideRef}`,
    icon: "Icon.80x80",
    persistent: true,
  });
}

// ─── Dialog management ────────────────────────────────────────────────────────
/**
 * Opens the result dialog, passes validation data to it, and handles
 * messages back from the dialog (override success, close).
 */
function openResultDialog(
  validationResult: ValidateResponse,
  item: Office.MessageCompose | Office.MessageRead | Office.AppointmentCompose | Office.AppointmentRead | null,
  done: () => void
): Promise<void> {
  return new Promise((resolve) => {
    const dialogUrl = getDialogUrl(validationResult.auditRef);

    Office.context.ui.displayDialogAsync(
      dialogUrl,
      { height: 70, width: 60, displayInIframe: false },
      (asyncResult) => {
        if (asyncResult.status === Office.AsyncResultStatus.Failed) {
          console.error(
            "[commands] Failed to open dialog:",
            asyncResult.error
          );
          showErrorNotification(
            `Could not open validation details dialog: ${asyncResult.error.message}`
          );
          done();
          resolve();
          return;
        }

        const dialog = asyncResult.value;

        // Listen for messages from the dialog page.
        dialog.addEventHandler(
          Office.EventType.DialogMessageReceived,
          (args: { message: string; origin: string | undefined } | { error: number }) => {
            if ("message" in args) {
              try {
                const msg = JSON.parse(args.message) as DialogOutboundMessage;

                if (msg.type === "OVERRIDE_SUCCESS" && msg.overrideRef) {
                  showOverrideNotification(msg.overrideRef);
                }
              } catch (e) {
                console.warn("[commands] Could not parse dialog message:", args.message);
              } finally {
                dialog.close();
                done();
                resolve();
              }
            }
          }
        );

        // Handle dialog closed by user (X button).
        dialog.addEventHandler(
          Office.EventType.DialogEventReceived,
          (args: { message: string; origin: string | undefined } | { error: number }) => {
            if ("error" in args && args.error === 12006) {
              done();
              resolve();
            }
          }
        );

        // Send validation result to the dialog once it's loaded.
        // The dialog signals readiness by sending a "READY" message.
        // We use a one-time handler override: re-attach MessageReceived
        // to first handle READY, then switch to full handling.
        // Simpler approach: use a short delay then send.
        // (Reliable cross-platform approach for MVP.)
        setTimeout(() => {
          const inboundMsg: DialogInboundMessage = {
            type: "VALIDATION_RESULT",
            payload: validationResult,
          };
          try {
            dialog.messageChild(JSON.stringify(inboundMsg));
          } catch (e) {
            console.warn("[commands] messageChild not supported, using postMessage fallback.");
            // Platform limitation: messageChild is only available in newer
            // Office builds. The dialog also polls via Office.context.ui.messageParent
            // in reverse, but for MVP we rely on messageChild.
          }
        }, 1500);
      }
    );
  });
}
