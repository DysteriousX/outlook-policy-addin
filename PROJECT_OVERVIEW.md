# Outlook Policy Validator — Simple Project Overview

## What this project is

This is a small Outlook add-in project that checks whether email recipients are allowed to receive attachments based on a policy ID found in the attachment filename.

It is built as two connected parts:
- `addin/`: the Office add-in frontend that runs inside Outlook
- `backend/`: a Node.js service that performs attachment policy validation

## Why it exists

Imagine sending a confidential policy document. This add-in helps make sure recipients are authorised for that specific policy before you send it.

It uses Outlook integration to:
- read recipients (To/Cc/Bcc)
- inspect attached filenames
- validate recipients against policy data
- show results inside Outlook using notifications and a dialog

## High-level flow

1. User creates an email in Outlook.
2. User attaches a file like `POL123456_test.pdf`.
3. User clicks `Validate Recipients` in the Outlook ribbon.
4. The add-in collects recipients and attachment info.
5. The add-in calls the backend API:
   - `POST /validate`
6. The backend decides if the attachment is `PASS`, `FAIL`, or `REVIEW`.
7. The add-in shows a notification or opens a dialog with details.

## Main scenarios

- **PASS ✅**
  - Attachment filename includes a valid policy ID
  - All recipients are authorised
  - Result: notification says `Validation PASSED`

- **FAIL ❌**
  - Attachment has a valid policy ID
  - Some recipient is not authorised
  - Result: dialog opens with FAIL and override option

- **REVIEW ⚠️**
  - Attachment does not contain a policy ID
  - Or the policy ID is unknown
  - Result: dialog opens with REVIEW status

## How the app is organized

### 1) `addin/` — Office add-in frontend

This part is the code that runs inside Outlook.

Key files:
- `manifest.xml`
  - Tells Outlook where to find pages and defines the ribbon command
- `src/commands/commands.ts`
  - Main ribbon button handler
  - Collects recipients, attachments, and calls backend validation
- `src/dialog/dialog.ts`
  - Handles the dialog page shown for FAIL/REVIEW results
  - Sends override confirmations back to the add-in
- `src/taskpane/taskpane.ts`
  - Minimal placeholder taskpane page
- `src/shared/apiClient.ts`
  - Sends requests to the backend
  - Builds headers and optionally includes SSO tokens
- `src/shared/types.ts`
  - Shared TypeScript shapes used by add-in and backend
- `webpack.config.js`
  - Builds the add-in bundles for commands, dialog, and taskpane

### 2) `backend/` — validation service

This part runs as a server and does the actual policy checks.

Key files:
- `src/index.ts`
  - Starts the Express server and sets up routes
- `src/routes/validate.ts`
  - Accepts validation requests from the add-in
- `src/routes/override.ts`
  - Accepts override requests when a user approves a FAIL result
- `src/services/validator.ts`
  - Core logic for PASS/FAIL/REVIEW decisions
  - Checks attachments against authorised recipient lists
- `src/services/policyAdminClient.ts`
  - Simulates policy lookup data
- `src/middleware/auth.ts`
  - Simple token extraction for requests

## Core validation rules

- If an attachment filename contains a policy ID like `POL123456`, the backend looks it up.
- If the policy is known and all email recipients are authorised:
  - attachment status = `PASS`
- If the policy is known and some recipients are not authorised:
  - attachment status = `FAIL`
- If the filename has no policy ID or the policy is unknown:
  - attachment status = `REVIEW`
- The overall result is:
  - `FAIL` if any attachment is FAIL
  - otherwise `REVIEW` if any attachment is REVIEW
  - otherwise `PASS`

## Simple architecture picture

```
Outlook Email Compose
       │
       ▼
Validate Recipients button
       │
       ▼
addin/src/commands/commands.ts
       │ collects recipients + attachments
       ▼
HTTP POST /validate → backend
       │
       ▼
backend/src/services/validator.ts
       │ checks policy IDs + recipients
       ▼
response: PASS / FAIL / REVIEW
       │
       ▼
addin shows notification or dialog
```

## How to run it

### Backend

```bash
cd backend
npm install
npm run dev
```

### Add-in

```bash
cd addin
npm install
npm run install-certs
npm start
```

Then sideload `addin/manifest.xml` into Outlook.

## Why this is useful for a college project

- It connects a frontend (Office add-in) with a backend API.
- It uses real-world concepts like:
  - email recipients
  - document attachments
  - validation logic
  - HTTP requests
  - TypeScript types and client/server separation
- It is simple enough to understand but also shows a real integration pattern.

## Quick understanding tips

- `commands.ts` is the main entry point for the Outlook button.
- `dialog.ts` is the UI for extra detail and override actions.
- `apiClient.ts` is the bridge between Outlook code and the server.
- `validator.ts` is the brain that decides PASS/FAIL/REVIEW.
- `manifest.xml` is the Outlook configuration file.

---

If you want, I can also add a second file with only the file-by-file map and one-line descriptions for each file.