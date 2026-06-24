# Outlook Policy Validator — Office Add-in MVP

A production-ready MVP Outlook Add-in that validates email recipients against authorised policy holders for every attachment.

---

## Key Features

1. **Production-Grade PDF Text Extraction:** Parses attached PDF files on the backend to extract policy numbers from the page text.
2. **Flexible & Configurable Regex:** Extraction regex patterns are configured in a central configuration file (`backend/src/config.ts`).
3. **Parallel Attachment Reading:** Processes multiple attachments in parallel, reading Base64 contents asynchronously on the client and parsing them concurrently on the backend.
4. **Password-Protected PDF Support:** Detects encrypted PDFs, prompting the user securely inside the review dialog for the password and validating it against the backend. All encrypted PDFs in a single email are assumed to share the same password.
5. **Read-Only Review Screen:** Displays validation statuses and mismatched recipients in a clean, read-only table interface. The Warn & Override form has been removed.

---

## Project Structure

```
outlook-policy-addin/
├── addin/                          # Office.js Add-in (TypeScript + Webpack)
│   ├── src/
│   │   ├── commands/
│   │   │   ├── commands.ts         # Ribbon button handler (ValidateRecipients + Parallel content fetching)
│   │   │   └── commands.html       # Invisible FunctionFile host page
│   │   ├── dialog/
│   │   │   ├── dialog.ts           # Dialog page logic (handles password validation prompts)
│   │   │   └── dialog.html         # Dialog HTML + CSS (password card & read-only results table)
│   │   ├── taskpane/
│   │   │   ├── taskpane.ts         # Minimal taskpane bootstrap
│   │   │   └── taskpane.html       # Placeholder taskpane page
│   │   └── shared/
│   │       ├── apiClient.ts        # Typed fetch client (SSO + /validate)
│   │       └── types.ts            # Shared TypeScript interfaces
│   ├── assets/                     # Icon files (PNG)
│   ├── manifest.xml                # Office Add-in manifest
│   ├── webpack.config.js           # Webpack build (3 entry points)
│   ├── package.json
│   └── tsconfig.json
└── backend/                        # Node.js + Express backend (TypeScript)
    ├── src/
    │   ├── index.ts                # Express server entry point
    │   ├── config.ts               # Configurable policy extraction regex patterns
    │   ├── types.ts                # Backend TypeScript types
    │   ├── routes/
    │   │   └── validate.ts         # POST /validate (handles initial validation & password submissions)
    │   ├── services/
    │   │   ├── policyAdminClient.ts # Stubbed policy lookup
    │   │   ├── resultStore.ts      # In-memory store caching results & pending requests
    │   │   └── validator.ts        # Pure validation logic (pdf-parse integration)
    │   └── middleware/
    │       └── auth.ts             # JWT extraction (MVP, no sig verification)
    ├── test/
    │   └── validator.test.ts       # Jest unit tests
    ├── package.json
    └── tsconfig.json
```

---

## Quick Start — Run Locally

### Prerequisites

| Tool         | Version  | Install                          |
|--------------|----------|----------------------------------|
| Node.js      | ≥ 18     | https://nodejs.org               |
| npm          | ≥ 9      | (bundled with Node)              |
| Outlook      | Desktop (Windows or Mac) | Microsoft 365 subscription |

---

### Step 1 — Install & Start the Backend

```bash
cd backend
npm install
npm run dev
```

The backend starts at **http://localhost:3001**. You should see:

```
✅ Backend server listening on http://localhost:3001
   POST http://localhost:3001/validate
   GET  http://localhost:3001/health
```

Verify with:
```bash
curl http://localhost:3001/health
# → {"status":"ok","timestamp":"..."}
```

---

### Step 2 — Install Dev SSL Certificates (add-in HTTPS requirement)

Office add-ins **must** be served over HTTPS, even locally.

```bash
cd addin
npm install
npm run install-certs
```

This generates trusted localhost certificates via `office-addin-dev-certs`.  
On Windows: run as Administrator if certificate trust fails.  
On Mac: enter your password when prompted.

---

### Step 3 — Start the Add-in Dev Server

```bash
cd addin
npm start
```

The webpack dev server starts at **https://localhost:3000**.

Test it's working:
```
https://localhost:3000/commands/commands.html  → blank page (correct)
https://localhost:3000/dialog/dialog.html      → dialog UI
https://localhost:3000/taskpane/taskpane.html  → taskpane placeholder
```

---

### Step 4 — Sideload the Manifest in Outlook

#### Windows (Outlook Desktop)

1. Open Outlook.
2. Go to **File → Options → Trust Center → Trust Center Settings**.
3. Click **Trusted Add-in Catalogs**.
4. Add a new catalog URL:  
   - URL: the folder path containing `manifest.xml`, e.g.  
     `C:\path\to\outlook-policy-addin\addin\`
   - Check **Show in Menu**. Click **OK**.
5. Restart Outlook.
6. Open a new email (compose window).
7. Click **Get Add-ins** (or **My Add-ins**) in the ribbon → **Shared Folder** → find **Recipient Policy Validator** → **Add**.
8. The **Validate Recipients** button appears in the compose ribbon.

#### Mac (Outlook Desktop)

1. Open Outlook.
2. Go to **Tools → Get Add-ins** (or **Insert → Get Add-ins** in compose).
3. Click **My add-ins** → **Add a custom add-in** → **Add from File…**
4. Select `addin/manifest.xml`.
5. Confirm the security prompt.
6. Open a compose window — the **Validate Recipients** button appears in the ribbon.

---

### Step 5 — Test the Add-in Scenarios

1. Open a **new email** in Outlook.
2. Add recipient `holder1@example.com` in the **To** field.

#### Scenario A: Pass (PDF Content Parsing)
* Attach a file named `invoice.pdf` (no policy ID in the filename) containing the text: `Policy Number: 123456`.
* Click **Validate Recipients** in the ribbon.
* ✅ You should see an **Outlook notification**: `Validation PASSED. Audit ref: AUD-XXXXXXXX`

#### Scenario B: Fail (Mismatched Recipient)
* Add recipient `intruder@evil.com` alongside `holder1@example.com`.
* Click **Validate Recipients**.
* A **dialog** opens showing the FAIL status and lists `intruder@evil.com` under mismatched recipients.

#### Scenario C: Password-Protected PDF Validation
* Attach a password-protected PDF file (which contains policy ID `123456` when decrypted).
* Click **Validate Recipients**.
* A **dialog** opens displaying a **Password Required** screen.
* Enter the password (`correct_password` in mock setup) and click **Validate**.
* The password card disappears and the read-only review screen renders the successfully validated attachment results.

---

## Backend API Reference

### POST /validate

#### 1. Initial Validation Request
Sends recipient list + attachment metadata and Base64 content to the backend.

**Request:**
```json
{
  "recipients": ["holder1@example.com"],
  "attachments": [
    { 
      "id": "att1", 
      "name": "invoice.pdf", 
      "size": 12345, 
      "content": "JVBERi0xLjQKJ..." 
    }
  ]
}
```

**Response (200 - Pass):**
```json
{
  "overallStatus": "PASS",
  "auditRef": "AUD-AB12CD34",
  "attachmentResults": [
    {
      "id": "att1",
      "name": "invoice.pdf",
      "policyId": "123456",
      "status": "PASS",
      "authorisedEmails": ["holder1@example.com"],
      "mismatchedRecipients": []
    }
  ]
}
```

**Response (200 - Password Required):**
If a PDF is password protected, the backend caches the payload and returns:
```json
{
  "overallStatus": "PASSWORD_REQUIRED",
  "auditRef": "AUD-PENDING12",
  "attachmentResults": [
    {
      "id": "att1",
      "name": "locked.pdf",
      "policyId": null,
      "status": "REVIEW",
      "authorisedEmails": [],
      "mismatchedRecipients": [],
      "reason": "Password required"
    }
  ]
}
```

#### 2. Password Submission Request
Once the user enters the password in the dialog, the client submits:

**Request:**
```json
{
  "auditRef": "AUD-PENDING12",
  "password": "correct_password"
}
```

**Response (200 - Success):**
```json
{
  "overallStatus": "PASS",
  "auditRef": "AUD-PENDING12",
  "attachmentResults": [
    {
      "id": "att1",
      "name": "locked.pdf",
      "policyId": "123456",
      "status": "PASS",
      "authorisedEmails": ["holder1@example.com"],
      "mismatchedRecipients": []
    }
  ]
}
```

**Response (400 - Incorrect Password):**
```json
{
  "error": "INCORRECT_PASSWORD"
}
```

---

## Hardcoded Test Policies (MVP)

| Policy ID | Authorised Emails |
|-----------|-------------------|
| `123456`  | `holder1@example.com` |
| `98765`   | `holder2@example.com`, `holder2.alt@example.com` |

---

## Run Unit Tests

```bash
cd backend
npm test
```

Expected output: **28 passing tests** covering:
* `normaliseEmail` — lowercase, trim
* `aggregateStatus` — PASS/FAIL/REVIEW precedence
* `validateAttachment` — all status branches, case-insensitivity
* `validate` — end-to-end including edge cases
* `extractPolicyIdFromText` — central, configurable regex matching
* `Password protected PDF validation` — throwing error without password, incorrect password failure, and successful extraction with correct password

---

## Production Deployment Notes

1. **HTTPS everywhere**: Host the add-in on a public HTTPS domain and update all `localhost:3000` references in `manifest.xml`.
2. **In-Memory Store replacement**: Replace the simple map in `resultStore.ts` with a persistent cache (e.g. Redis) that has a configured TTL (Time To Live) to handle load-balanced environments with multiple users.
3. **Real policy client**: Replace `policyAdminClient.ts` stub with actual API calls to your Policy Administration System.
4. **Real JWT validation**: Implement signature verification in `auth.ts` using `jose` and Microsoft's JWKS endpoint.
5. **Manifest submission**: Submit `manifest.xml` to your Microsoft 365 admin center for organization-wide deployment.
