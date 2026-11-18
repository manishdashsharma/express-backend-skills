---
name: auth-sessions
description: Secure authentication for Express APIs — short-lived access JWT in memory, refresh token in an httpOnly cookie rotated in place with a reuse grace window and theft detection, server-side session records, email/password with verification, Google ID-token sign-in, logout and logout-everywhere, role middleware. Use when building or reviewing sign-up, sign-in, refresh, logout, sessions, JWT or OAuth login in a Node.js backend.
---

# Auth & Sessions

A complete, tested implementation ships in the `create-backend` skill's Markdown bundles: `../create-backend/templates/common.md` (`src/modules/auth/` controller, routes, validations, token utils, middleware), `../create-backend/templates/mongodb.md` (`auth.service.js`, `user.model.js`, `session.model.js`) and `../create-backend/templates/postgres.md` (`auth.service.js`, `prisma/schema.prisma`). Write those files; the rules below explain them.

## Model

| Token | Lifetime | Where it lives | Readable by JS |
|---|---|---|---|
| Access JWT | 15 min | Response body → client memory only | yes (in memory, never localStorage) |
| Refresh JWT | 7 days | `httpOnly; Secure; SameSite=Strict` cookie, `path=/v1/auth` | no |

The client sends `Authorization: Bearer <access>`. On `401` it calls `POST /v1/auth/refresh` once (cookie rides along), then replays the original request once.

## Session record

One row/document per sign-in (Mongo collection or Prisma table):

```
Session { id, userId, tokenHash, previousTokenHash, userAgent, ip,
          expiresAt, revokedAt, refreshedAt, createdAt, updatedAt }
```

- Store only `sha256(refreshToken)`, never the token.
- Index `userId`; TTL index on `expiresAt` (Mongo: `{ expireAfterSeconds: 0 }`) or a cleanup job (Postgres).
- `Session` is the one collection that may skip `isActive` — `revokedAt` is its state.

## Endpoints (GET/POST only)

| Route | Notes |
|---|---|
| `POST /v1/auth/sign-up` | Create user, hash password (bcrypt, rounds from config), send verify email. Do **not** issue a session until verified if verification is required. |
| `POST /v1/auth/sign-in` | Constant-shape error for wrong email *or* password: "Email or password is incorrect". Strict per-IP rate limit. |
| `POST /v1/auth/google` | Verify the Google ID token server-side with `google-auth-library` against `GOOGLE_CLIENT_ID`; find or create the user by `googleId`; email counts as verified. |
| `POST /v1/auth/refresh` | Rotate (below). |
| `POST /v1/auth/logout` | Revoke this session, clear the cookie. |
| `POST /v1/auth/logout-all` | Revoke every session for the user. |
| `GET /v1/auth/me` | Current user, safe fields only. |
| `GET /v1/auth/sessions` | List active sessions, mark the current one. |

## Issuing a session

```js
const createSession = async (userId, ctx) => {
  const sessionId = randomUUID();
  const refreshToken = signRefreshToken({ userId, sessionId, jti: randomUUID() });
  await saveSession({
    id: sessionId,
    userId,
    tokenHash: hashToken(refreshToken),
    userAgent: ctx.userAgent,
    ip: ctx.ip,
    expiresAt: new Date(Date.now() + config.cookie.maxAgeMs),
  });
  return { accessToken: signAccessToken(claimsOf(user)), refreshToken };
};
```

Controller sets the cookie and returns only the access token and safe user fields:

```js
res.cookie(config.cookie.refreshName, refreshToken, {
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  path: config.cookie.path,
  maxAge: config.cookie.maxAgeMs,
});
return httpResponse(req, res, 200, responseMessage.custom('Signed in'), { accessToken, user });
```

## Refresh rotation (in place, race-safe, theft-detecting)

```js
const REFRESH_REUSE_GRACE_MS = 10000;
const withinGrace = (moment) => Boolean(moment) && Date.now() - moment.getTime() <= REFRESH_REUSE_GRACE_MS;

const refreshSessionService = async (rawToken, ctx) => {
  if (!rawToken) throw unauthorized('No active session');
  let payload;
  try { payload = verifyRefreshToken(rawToken); } catch { throw unauthorized('Session expired, please sign in again'); }

  const session = await findSession(payload.sid);
  if (!session || String(session.userId) !== payload.sub) throw unauthorized('Session not found');
  if (session.revokedAt || session.expiresAt <= new Date()) throw unauthorized('Session expired, please sign in again');

  const presented = hashToken(rawToken);
  const accessToken = signAccessToken(await loadClaims(session.userId));

  if (presented === session.previousTokenHash && withinGrace(session.refreshedAt)) {
    return { accessToken, refreshToken: null };
  }
  if (presented !== session.tokenHash) {
    await revokeAllSessions(session.userId);
    logger.security('Refresh token reuse detected', { userId: session.userId });
    throw unauthorized('Session invalidated, please sign in again');
  }

  const refreshToken = signRefreshToken({ userId: session.userId, sessionId: session.id, jti: randomUUID() });
  const rotated = await rotateIfCurrent(session.id, presented, {
    tokenHash: hashToken(refreshToken),
    previousTokenHash: presented,
    refreshedAt: new Date(),
    expiresAt: new Date(Date.now() + config.cookie.maxAgeMs),
  });
  return { accessToken, refreshToken: rotated ? refreshToken : null };
};
```

(Shown compact for reading; write it with full braces per lint rules.)

Why each piece exists:
- **Rotate in place** on the same session row — the session id stays stable for "list my devices".
- **Grace window** — two tabs refreshing at once both present the old token; the second gets an access token without a new cookie instead of being logged out.
- **Reuse outside the grace window** means the token was stolen → revoke every session for the user.
- **`rotateIfCurrent`** is a conditional update (`where: { id, tokenHash: presented, revokedAt: null }` / `findOneAndUpdate` with the same filter) so two concurrent rotations cannot both win.
- When `refreshToken` is `null`, the controller does not touch the cookie.

## Middleware

- `authenticate` verifies the access token and sets `req.user = { id, role }` (plus a tenant id such as `storeId` when the product is multi-tenant). Missing/invalid → 401 with a generic message, logged with `logger.security`.
- `authorize(...roles)` → 403 when the role is not allowed.
- Tenant membership checks (tenant resolver middleware) return **404** for non-members so existence is never confirmed.
- If a user can be disabled or roles change often, re-check against a short-TTL cached user record instead of trusting stale claims.

## Rules

- Passwords: bcrypt, rounds from config (≥ 12). Never log, return or cache a password or hash.
- User payloads never include `password`, `tokenHash`, or private fields (`phone`, etc.) unless a dedicated, authorized endpoint returns them.
- Email verify and password reset tokens are single-purpose JWTs with their own short expiry; reset revokes all sessions.
- Credential endpoints: strict per-IP rate limit plus per-account failure counter; email sends have a cooldown and hourly cap.
- `SameSite=Strict` + cookie path `/v1/auth` keeps the refresh cookie off every other request.
- Logout clears the cookie with the same options it was set with.
