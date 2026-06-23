# Outlook Policy Validator — Office Add-in MVP

A production-ready MVP Outlook Add-in that validates email recipients against authorised policy holders for every attachment.

---

## Project Structure

```
outlook-policy-addin/
├── addin/                          # Office.js Add-in (TypeScript + Webpack)
│   ├── src/
│   │   ├── commands/
│   │   │   ├── commands.ts         # Ribbon button handler (ValidateRecipients)
│   │   │   └── commands.html       # Invisible FunctionFile host page
│   │   ├── dialog/
│   │   │   ├── dialog.ts           # Dialog page logic
│   │   │   └── dialog.html         # Dialog HTML + CSS
│   │   ├── taskpane/
│   │   │   ├── taskpane.ts         # Minimal taskpane bootstrap
│   │   │   └── taskpane.html       # Placeholder taskpane page
│   │   └── shared/
│   │       ├── apiClient.ts        # Typed fetch client (SSO + /validate + /override)
│   │       └── types.ts            # Shared TypeScript interfaces
│   ├── assets/                     # Icon files (PNG)
│   ├── manifest.xml                # Office Add-in manifest
│   ├── webpack.config.js           # Webpack build (3 entry points)
│   ├── package.json
│   └── tsconfig.json
└── backend/                        # Node.js + Express backend (TypeScript)
    ├── src/
    │   ├── index.ts                # Express server entry point
    │   ├── types.ts                # Backend TypeScript types
    │   ├── routes/
    │   │   ├── validate.ts         # POST /validate
    │   │   └── override.ts         # POST /override
    │   ├── services/
    │   │   ├── policyAdminClient.ts # Stubbed policy lookup
    │   │   └── validator.ts        # Pure validation logic
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
   POST http://localhost:3001/override
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

**Alternative (faster) via PowerShell:**
```powershell
# Installs the manifest from a local file path
$manifestPath = "C:\path\to\outlook-policy-addin\addin\manifest.xml"
# Use the Office Add-in Sideloader or the method above
```

#### Mac (Outlook Desktop)

1. Open Outlook.
2. Go to **Tools → Get Add-ins** (or **Insert → Get Add-ins** in compose).
3. Click **My add-ins** → **Add a custom add-in** → **Add from File…**
4. Select `addin/manifest.xml`.
5. Confirm the security prompt.
6. Open a compose window — the **Validate Recipients** button appears in the ribbon.

**Alternative via terminal:**
```bash
# Copy manifest to the Outlook add-in directory on Mac
cp addin/manifest.xml ~/Library/Containers/com.microsoft.Outlook/Data/Documents/wef/
# Then restart Outlook and the add-in auto-loads.
```

---

### Step 5 — Test the Add-in

1. Open a **new email** in Outlook.
2. Add an attachment named `POL123456_summary.pdf`.
3. Add recipient `holder1@example.com` in To.
4. Click **Validate Recipients** in the ribbon.
5. ✅ You should see an **Outlook notification**: `Validation PASSED. Audit ref: AUD-XXXXXXXX`

**Test FAIL scenario:**
- Add recipient `intruder@evil.com` alongside `holder1@example.com`.
- Click **Validate Recipients**.
- A **dialog** opens showing FAIL status, the mismatched recipient, and the override form.

**Test REVIEW scenario:**
- Attach a file named `invoice.pdf` (no policy ID pattern).
- The dialog opens with REVIEW status.

---

## Backend API Reference

### POST /validate

**Request:**
```json
{
  "recipients": ["holder1@example.com", "holder2@example.com"],
  "attachments": [
    { "id": "att1", "name": "POL123456_policy.pdf", "size": 12345, "policyId": "123456" }
  ]
}
```

**Response (200):**
```json
{
  "overallStatus": "PASS",
  "auditRef": "AUD-AB12CD34",
  "attachmentResults": [
    {
      "id": "att1",
      "name": "POL123456_policy.pdf",
      "policyId": "123456",
      "status": "PASS",
      "authorisedEmails": ["holder1@example.com"],
      "mismatchedRecipients": []
    }
  ]
}
```

### POST /override

**Request:**
```json
{
  "auditRef": "AUD-AB12CD34",
  "reasonCode": "AUTHORISED_EXCEPTION",
  "reasonText": "Broker authorised by underwriter on call ref UC-2024-001",
  "confirmedByUser": true
}
```

**Response (201):**
```json
{
  "overrideRef": "OVR-EF56GH78",
  "auditRef": "AUD-AB12CD34",
  "recordedAt": "2024-01-15T10:30:00.000Z"
}
```

---

## Hardcoded Test Policies (MVP)

| Policy ID | Authorised Emails |
|-----------|-------------------|
| `123456`  | `holder1@example.com` |
| `98765`   | `holder2@example.com`, `holder2.alt@example.com` |

Filename patterns recognised:
- `POL123456_*.pdf` → policyId = `123456`
- `Policy-98765.docx` → policyId = `98765`
- Any filename with 5+ consecutive digits → extracted as policyId (fallback)

---

## Run Unit Tests

```bash
cd backend
npm test
```

Expected output: **16 passing tests** covering:
- `normaliseEmail` — lowercase, trim
- `aggregateStatus` — PASS/FAIL/REVIEW precedence
- `validateAttachment` — all status branches, case-insensitivity
- `validate` — end-to-end including edge cases

---

## SSO Configuration (Production)

For real Microsoft SSO, update `manifest.xml`:

```xml
<WebApplicationInfo>
  <Id>YOUR_REAL_AAD_CLIENT_ID</Id>
  <Resource>api://localhost:3000/YOUR_REAL_AAD_CLIENT_ID</Resource>
  ...
</WebApplicationInfo>
```

Then in Azure Portal:
1. Register an App Registration (AAD).
2. Set Redirect URI to `https://localhost:3000`.
3. Expose an API: `api://localhost:3000/{clientId}/access_as_user`.
4. Add Microsoft Graph delegated permission: `User.Read`.
5. Pre-authorize the Office client IDs (d3590ed6-52b3-… for Office desktop, etc.).

In `backend/src/middleware/auth.ts`, replace the MVP stub with real JWT verification using the `jose` library.

---

## Environment Variables

### Backend (`backend/.env`)
```env
PORT=3001
```

### Add-in (`addin/.env` or set before `npm start`)
```env
BACKEND_BASE_URL=http://localhost:3001
```

---

## Production Deployment Notes

1. **HTTPS everywhere**: Host the add-in on a public HTTPS domain and update all `localhost:3000` references in `manifest.xml`.
2. **Real policy client**: Replace `policyAdminClient.ts` stub with actual HTTP calls to your Policy Administration System.
3. **Real JWT validation**: Implement signature verification in `auth.ts` using `jose` and Microsoft's JWKS endpoint.
4. **Persistent override storage**: Replace the `Map` in `override.ts` with a database (e.g., Azure Cosmos DB, PostgreSQL).
5. **Manifest submission**: Submit `manifest.xml` to your Microsoft 365 admin center for organization-wide deployment.
