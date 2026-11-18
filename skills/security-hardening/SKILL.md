---
name: security-hardening
description: Production security checklist and fixes for Express APIs — tenant isolation (404 not 403), input validation, helmet/CORS/body limits, rate limits, secrets in config only, encrypted third-party keys, SSRF guards on outbound URLs, HTML sanitization, safe uploads, webhook signature checks, error and log hygiene, and dependency hygiene. Use after writing auth, endpoints, file uploads, webhooks, outbound HTTP or anything touching user data, or before a release.
---

# Security Hardening

Work through each section against the code in scope. Fix what is fixable; list what needs a human decision.

## 1. Tenant isolation (most common real bug)

- Every domain query filters by the scope field taken from `req.user` / resolved middleware — **never** from `req.body` or `req.query`.
- Lookups by id include the scope: `findOne({ _id, storeId })` / `findFirst({ where: { id, orgId } })`. Id-only lookups are an IDOR.
- Another tenant's resource → **404**, so existence is not confirmed. Same for non-members of an org/project.
- Updates/deletes use scoped filters (`updateMany({ where: { id, orgId } })`) so a guessed id cannot touch another tenant.
- List endpoints for non-admin roles filter to what the caller may see, not "everything in the org".
- Public/share endpoints return an explicit allowlist of fields; never owner email, ids of private records or settings.

## 2. Input

- Every route has `validateRequest(schema, source)` for body, query **and** params. Zod strips unknown keys by default — keep it that way; never spread `req.body` into a write without a schema.
- Strings have `max()`; arrays have `max()`; numbers have bounds; ids have a format.
- Mass-assignment: fields like `role`, `isActive`, `storeId`, `plan`, `ownerId` are never accepted from clients on ordinary endpoints.
- User text used in `$regex` is escaped; Mongo filters never take raw objects from the client (operator injection: `{ "$gt": "" }`).
- Size limits at the edge: `express.json({ limit })` sized to the largest legitimate payload, plus explicit domain limits (e.g. reject a document over N MB before the database rejects it).

## 3. Transport and headers

- `helmet()` on; `app.disable('x-powered-by')`; `trust proxy` set to the real number of proxies.
- CORS: explicit origin allowlist from config with `credentials: true`. Never `*` with credentials.
- Cookies carrying auth: `httpOnly`, `Secure` in production, `SameSite=Strict`, narrow `path`.
- Webhook routes that verify signatures use `express.raw()` **before** `express.json()` and compare HMACs with `crypto.timingSafeEqual`.

## 4. Rate limits

Redis-backed so they hold across instances: coarse per-IP, strict on credential endpoints, per-user on writes and expensive routes (AI, exports, email sends). Numbers come from config. See `redis-cache`.

## 5. Secrets

- Only `src/config/index.js` reads `process.env`; required secrets fail boot when missing.
- `.env` is gitignored; `.env.example` has every key with placeholders. Search the diff for keys, tokens and connection strings before committing.
- Third-party credentials stored on behalf of users (API keys, OAuth tokens) are encrypted with AES-256-GCM (`secret-box.js` in `ai-integration`), shown only as last-4.
- Tokens stored server-side are hashed (sha256), not kept in plain text.

## 6. Outbound requests

- Any URL a user can influence (webhooks, AI base URLs, image fetches, link previews) goes through an SSRF guard: https only, resolved IP not private/loopback/link-local/metadata, checked at call time.
- Outbound calls have timeouts and no automatic retries on non-idempotent requests.

## 7. Output and content

- User-supplied HTML (rich text) is sanitized server-side with an allowlist (`sanitize-html`); never trust client sanitization.
- Private files are stored by path and served as short-lived signed URLs built at response time, never public URLs. Accept a file reference only if it was uploaded by this tenant recently or is already attached in the same tenant.
- Sensitive fields (`password`, `tokenHash`, `phone`, key ciphertext) are excluded by explicit `select`, not by deleting after fetch.

## 8. Errors and logs

- Clients see 4xx messages and a generic 5xx message; stacks only outside production.
- Logs never contain passwords, tokens, API keys, cookies, full request bodies on auth routes, or AI prompt/completion text unless the product stores it by design.
- Security events (`token rejected`, `refresh reuse`, repeated failed sign-in) use `logger.security` with `requestId` and `userId`.

## 9. Dependencies

- `npm audit --omit=dev`; upgrade or justify every high/critical.
- No new dependency for something the platform already does (`crypto`, `fetch`, `net.BlockList`).

## Report format

```
[CRITICAL] IDOR on getInvoice — src/modules/invoice/services/invoice.service.js:42
  findFirst({ where: { id } }) has no orgId. Fixed: added orgId + isActive.
[HIGH] Missing rate limit on POST /v1/auth/forgot-password — needs config value (manual)
```

CRITICAL blocks release. HIGH should be fixed before release. List manual items separately.
