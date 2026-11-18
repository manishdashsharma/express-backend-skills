# Auth

`/v1/auth`. Access token in the response body (keep it in memory), refresh token in an `httpOnly; Secure; SameSite=Strict` cookie scoped to `/v1/auth`.

The `user` object: `{ id, name, email, role, createdAt }`.

---

## POST /v1/auth/sign-up

Public. Strict per-IP rate limit.

**Body**: `{ "name", "email", "password" }` — name 1–100, password 8–128.

**201** → `data`: `{ "accessToken", "user": <user> }` and sets the refresh cookie. **409** email already registered.

---

## POST /v1/auth/sign-in

Public. Strict per-IP rate limit.

**Body**: `{ "email", "password" }`.

**200** → `data`: `{ "accessToken", "user": <user> }` and sets the refresh cookie. **401** "Email or password is incorrect".

---

## POST /v1/auth/refresh

Cookie only. Rotates the refresh token. Two tabs refreshing at once are both served. Reusing an old refresh token signs the account out everywhere.

**200** → `data`: `{ "accessToken" }`. **401** no session, expired, revoked or reused (cookie cleared).

---

## POST /v1/auth/logout

Cookie only. Revokes this session and clears the cookie. Always **200**.

---

## POST /v1/auth/logout-all

Bearer auth. Revokes every session for the user.

**200** → `null`.

---

## GET /v1/auth/me

Bearer auth.

**200** → `data`: `{ "user": <user> }`. **404** account no longer active.

---

## GET /v1/auth/sessions

Bearer auth. Active sessions, newest first, max 50.

**200** → `data`: `{ "sessions": [ { "id", "userAgent", "ip", "createdAt", "lastActiveAt", "isCurrent" } ] }`.
