# Outlook Add-in Admin Handoff

This document is intended for the IT/admin team responsible for hosting and deploying the Outlook add-in across Microsoft 365.

## What to provide

1. `manifest.xml`
   - The Outlook add-in manifest file located at `addin/manifest.xml`.
   - It defines the add-in metadata, ribbon command, and page URLs.

2. Front-end host URL
   - The add-in web pages must be served over HTTPS.
   - The URLs required by the manifest are:
     - `https://<frontend-host>/commands/commands.html`
     - `https://<frontend-host>/taskpane/taskpane.html`
     - `https://<frontend-host>/dialog/dialog.html`

3. Backend API host
   - The validation service must also be accessible over HTTPS.
   - The add-in calls:
     - `https://<backend-host>/validate`
     - `https://<backend-host>/override`
     - optionally: `https://<backend-host>/health`

4. Certificate requirement
   - Production deployment requires valid TLS certificates trusted by the organization.
   - Local development can use self-signed dev certs, but these are not suitable for enterprise rollout.

5. Network and firewall settings
   - Allow Outlook clients to connect to both the front-end host and backend host.
   - If the backend is on a different domain, ensure CORS is configured to allow requests from the add-in origin.

## Recommended deployment options

### Centralized deployment (best)
- Use the Microsoft 365 admin center to deploy the add-in to users or groups.
- The admin needs:
  - the add-in manifest (`addin/manifest.xml`)
  - the URL of the hosted add-in pages
  - the URL of the backend API

### Organization catalog
- Host the manifest in a shared network folder or domain.
- Configure the catalog in Exchange/Outlook so users can install the add-in from there.
- Suitable if centralized deployment is not available.

## What the add-in does

- Runs inside Outlook as an Office add-in.
- Reads email recipients and attachment metadata.
- Sends recipient and attachment info to a backend validation service.
- Shows:
  - `PASS` as a notification when all recipients are authorised
  - `FAIL` or `REVIEW` in a dialog when there are issues

## Notes for the admin team

- The front-end code is in `addin/`.
- The backend service is in `backend/` and is built with Node.js + Express.
- The add-in does not currently include a full Azure AD-based SSO implementation.
- If Azure AD / tenant authentication is required later, the team may need to register an AAD application and update the add-in and backend accordingly.

## Suggested handoff package

Share the following:
- `addin/manifest.xml`
- hosted front-end URL(s)
- hosted backend URL(s)
- SSL certificate details
- any environment or deployment notes for the hosting platform

## Example to provide

- Manifest: `https://<frontend-host>/manifest.xml`
- Front-end host: `https://outlook-policy.example.com`
- Backend host: `https://api.outlook-policy.example.com`
- Deployment type: Microsoft 365 centralized deployment or shared add-in catalog
