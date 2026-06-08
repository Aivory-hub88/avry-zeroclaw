---
# n8n Skill

## Purpose
Build, test, and deploy n8n workflows directly via n8n-as-code service.
Zeroclaw calls this service directly — do NOT route through VPS Bridge.

## Connection
base_url: http://127.0.0.1:3500
auth_header: X-Internal-Key: aivory-internal-2026
timeout: 120s
on_error: ECONNREFUSED → tell user "n8n-as-code service is offline, 
          check systemctl status n8n-as-code-service"

## Endpoints
POST /drafts/build       — generate workflow JSON from natural language spec
POST /drafts/test        — run sandbox test on a draft (always run before deploy)
POST /drafts/bind-cred   — attach credentials/secrets to a draft
POST /drafts/deploy      — deploy draft to live n8n instance (:5678)
GET  /report             — get status and result of last operation
POST /drafts/cleanup     — remove draft and temp artifacts

## Workflow (always follow this order)
1. /drafts/build   — generate from user spec
2. /drafts/test    — validate (REQUIRED before deploy)
3. /drafts/deploy  — only after user confirms
4. /report         — return result to user

## Rules
- NEVER skip /drafts/test before /drafts/deploy
- NEVER auto-deploy without explicit user confirmation ("yes deploy it", "go ahead")
- If /drafts/test takes > 30s, warn user before continuing
- If deploy fails, run /report and show the error — do not retry silently
- Never expose internal URLs or tokens in user-facing responses
