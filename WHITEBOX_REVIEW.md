# White-Box Security Review — HealthVault

**Module:** ST6005CEM — Security (CW2)
**Target:** HealthVault appointment booking & patient document vault
**Review type:** White-box (authenticated source code review, full source access)
**Codebase reviewed:** Local working tree at commit `5f6f608` **plus uncommitted changes** (document vault, Stripe payments, password reset)
**Reviewer:** Self-review, author of the application
**Date:** July 2026

---

## 1. Method

Manual line-by-line review of all security-relevant source, guided by the **OWASP Application Security Verification Standard (ASVS) v4.0.3** control families and cross-referenced to **OWASP Top 10 (2021)** categories. Areas reviewed: authentication, authorization, input validation, session handling, business logic, API security, client-side security.

Static review only — no code was executed during this phase. Every finding below is subsequently either confirmed or refuted by dynamic testing in the penetration testing phase (Phase 4).

**Severity scale:** Critical / High / Medium / Low / Informational. CVSS v3.1 vectors are assigned in the findings register (Phase 5) after dynamic confirmation.

---

## 2. Summary of findings

| # | Finding | Area | Severity |
|---|---------|------|----------|
| WB-01 | Session JWT survives password reset / change | Session | **High** |
| WB-02 | Dev-mode reset & magic-link tokens echoed in HTTP response | Authentication | **High** |
| WB-03 | No server-side session revocation on logout | Session | Medium |
| WB-04 | Uploaded file MIME type is client-controlled and reflected | Input validation | Medium |
| WB-05 | `login-precheck` leaks per-account MFA status | Authentication | Medium |
| WB-06 | Race condition in cancel/refund permits double refund | Business logic | Medium |
| WB-07 | MFA secret can be re-issued without re-authentication | Authentication | Medium |
| WB-08 | No Content-Security-Policy on the served frontend | Client-side | Medium |
| WB-09 | No upload rate limit or per-user storage quota | API security | Medium |
| WB-10 | MFA-enabled accounts bypass CAPTCHA at login | Authentication | Low |
| WB-11 | Cookie `secure` flag depends on `NODE_ENV` | Session | Low |
| WB-12 | Stripe webhook subject to global IP rate limit | API security | Low |
| WB-13 | Unpaid appointments are fully functional | Business logic | Informational |
| WB-14 | `dangerouslySetInnerHTML` used for CAPTCHA SVG | Client-side | Informational |

**Controls confirmed effective:** 18 (see §4 per-area "confirmed secure" subsections).

---

## 3. Findings

### WB-01 — Session JWT remains valid after password reset — **High**

**Files:** `healthcare-backned/src/controllers/authController.ts:600-619`, `healthcare-backned/src/middleware/authMiddleware.ts:76-118`

**OWASP:** A07:2021 Identification and Authentication Failures · ASVS V3.3.2

The password reset flow correctly invalidates outstanding *reset tokens* by comparing `decoded.pwdVersion` against `user.passwordChangedAt` (`authController.ts:600`). However, the **session** JWT issued at login carries only `{ id, role, uaHash, mfaPending }` (`authController.ts:22-31`) — no password version. The `protect` middleware (`authMiddleware.ts:76-118`) never compares the session token's issue time against `user.passwordChangedAt`.

Consequence: the primary reason a user resets their password is that they believe their account is compromised. An attacker holding a stolen session cookie **retains full access for the remainder of the 1-hour token lifetime even after the victim completes a password reset.** The recovery mechanism does not actually evict the attacker.

**Fix:** Embed `pwdVersion: user.passwordChangedAt.getTime()` in the session JWT in `signToken()`, and reject in `protect` when it no longer matches the live user record:

```ts
if (decoded.pwdVersion !== undefined &&
    decoded.pwdVersion !== user.passwordChangedAt.getTime()) {
  res.status(401).json({ message: 'Session invalidated by a password change — please log in again' });
  return;
}
```

---

### WB-02 — Password reset and magic-link tokens returned in HTTP response body — **High (conditional)**

**Files:** `healthcare-backned/src/controllers/authController.ts:397-401` (`devMagicLink`), `authController.ts:538-542` (`devResetLink`)

**OWASP:** A05:2021 Security Misconfiguration · ASVS V2.5.1

When SMTP is not configured, both endpoints return a **fully valid account-takeover token** directly in the JSON response to an unauthenticated caller:

```ts
...(!emailSent && process.env.NODE_ENV !== 'production' ? { devResetLink: resetLink } : {}),
```

The guard is a *single* environment-variable comparison. `NODE_ENV` unset, misspelled, or set to `Production` (capitalised) evaluates truthy and the token is disclosed. Anyone able to POST an email address to `/api/auth/forgot-password` then receives a working reset link for that account — complete pre-authentication account takeover.

The Dockerfile does set `ENV NODE_ENV=production` (`healthcare-backned/Dockerfile`), which mitigates the containerised deployment. The risk is that this is the *only* thing standing between a misconfiguration and total account compromise, with no secondary control.

**Fix:** Gate on explicit opt-in rather than absence of production, and fail closed:

```ts
const DEV_ECHO_ENABLED = process.env.ALLOW_DEV_TOKEN_ECHO === 'true' &&
                         process.env.NODE_ENV === 'development';
```

Log loudly at startup whenever the echo path is enabled.

---

### WB-03 — No server-side session revocation on logout — **Medium**

**File:** `healthcare-backned/src/controllers/authController.ts:641-657`

**OWASP:** A07:2021 · ASVS V3.3.1

`logout` calls `res.clearCookie('token', ...)` only. The JWT itself is stateless and remains cryptographically valid until its `exp` (1 hour). A token captured before logout continues to authenticate afterwards. "Log out" is therefore a client-side hint, not a security boundary.

**Fix:** Same mechanism as WB-01 — a `tokenVersion` integer on the user document, incremented on logout and checked in `protect`. This gives genuine revocation without introducing a session store.

---

### WB-04 — Uploaded file MIME type is client-controlled and reflected on download — **Medium**

**Files:** `healthcare-backned/src/middleware/vaultUpload.ts:4-12`, `healthcare-backned/src/controllers/documentController.ts:42`, `documentController.ts:131`

**OWASP:** A03:2021 Injection / Unrestricted File Upload · ASVS V12.1

The upload filter tests `file.mimetype` (`vaultUpload.ts:7`), which is taken verbatim from the `Content-Type` header of the multipart part — **a value the client sets and fully controls.** No magic-byte (file signature) verification is performed. The unverified value is then persisted (`documentController.ts:42`) and later echoed into the download response header (`documentController.ts:131`):

```ts
res.setHeader('Content-Type', doc.mimeType);
```

An attacker can therefore store arbitrary content — an HTML page containing script, a polyglot file — while declaring it `application/pdf`, and cause the server to serve it back under an attacker-chosen content type.

Exploitability is currently limited by two factors: `Content-Disposition: attachment` (`documentController.ts:133-135`) forces download rather than inline rendering, and documents are only retrievable by their owner. The finding is nevertheless valid — the control as written does not do what it claims, and any future change to inline rendering or sharing turns it into stored XSS.

**Fix:** Validate the actual file signature server-side against the declared type, and serve from a fixed safe allowlist rather than the stored value:

```ts
// after multer, before encryption
const detected = await fileTypeFromBuffer(req.file.buffer); // 'file-type' package
if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
  res.status(400).json({ message: 'File content does not match an allowed type' });
  return;
}
```

Store `detected.mime`, not `req.file.mimetype`. Additionally send `X-Content-Type-Options: nosniff` on the download response.

---

### WB-05 — `login-precheck` discloses per-account MFA status — **Medium**

**File:** `healthcare-backned/src/controllers/authController.ts:98-113`

**OWASP:** A01:2021 Broken Access Control (information disclosure) · ASVS V2.2.1

```ts
res.status(200).json({ captchaRequired: !user || !user.mfaEnabled });
```

The documented design goal — that unknown emails are indistinguishable from registered non-MFA accounts — **is met**: both return `captchaRequired: true`. That part of the control is sound.

However, a response of `captchaRequired: false` is returned **only** when the account exists *and* has MFA enabled. For any email an attacker already knows is registered (harvested from a breach corpus, or the institution's predictable address format), this endpoint is a reliable oracle for "does this account have MFA?". An attacker enumerates a user list and concentrates credential-stuffing on the accounts without a second factor — precisely the accounts where stuffing succeeds.

The route shares `/login`'s 5-per-15-minute limiter (`authRoutes.ts:50`), which slows but does not prevent enumeration across a distributed source set.

**Fix:** Decouple the CAPTCHA decision from account state. Either require CAPTCHA on every login attempt regardless of MFA (simplest, removes the oracle entirely), or make the decision session-scoped — issue a CAPTCHA challenge on first attempt from an unrecognised client, independent of which account is named.

---

### WB-06 — Race condition in cancellation permits duplicate refunds — **Medium**

**File:** `healthcare-backned/src/controllers/appointmentController.ts:169-220`

**OWASP:** A04:2021 Insecure Design · ASVS V11.1.6

`cancelAppointment` performs a read-check-act sequence with **no transaction and no atomic guard**:

1. `findById(id)` — line 169
2. checks `appointment.status === 'cancelled'` — line 187
3. calls `stripe.refunds.create(...)` — line 208
4. `appointment.save()` — line 220

Two concurrent `PUT /api/appointments/:id/cancel` requests both read `status: 'pending'` at step 1, both pass the guard at step 2, and both reach step 3 — issuing **two Stripe refunds against a single payment intent.** The database write at step 4 is last-write-wins and hides the duplication.

This contrasts sharply with `bookAppointment` (`appointmentController.ts:53-94`), which correctly uses a Mongoose session transaction plus a partial unique index. The same rigour was not applied to the cancellation path.

**Fix:** Make the state transition atomic and let the database arbitrate — only the request that actually flips the status proceeds to refund:

```ts
const claimed = await Appointment.findOneAndUpdate(
  { _id: id, status: { $ne: 'cancelled' } },
  { $set: { status: 'cancelled', isActive: false } },
  { new: true }
);
if (!claimed) {
  res.status(400).json({ message: 'Appointment is already cancelled' });
  return;
}
// only now issue the refund
```

Also pass a Stripe **idempotency key** (`{ idempotencyKey: \`refund-${appointment._id}\` }`) as defence in depth.

---

### WB-07 — MFA secret re-issued without re-authentication — **Medium**

**File:** `healthcare-backned/src/controllers/authController.ts:247-280`

**OWASP:** A07:2021 · ASVS V2.8.1

`enableMFA` unconditionally generates and saves a **new** TOTP secret (`authController.ts:260-266`) for any authenticated caller, including an account where `mfaEnabled` is already `true`. It does not require the current TOTP code, nor the account password, before overwriting.

An attacker who obtains a session cookie can therefore call `POST /api/auth/enable-mfa`, receive a fresh `base32` secret and `otpauthUrl` in the response body, and enrol their own authenticator — displacing the legitimate user's second factor and establishing durable access. The legitimate user's authenticator silently stops working.

**Fix:** Require step-up authentication before rotating an existing secret:

```ts
if (user.mfaEnabled) {
  const { currentPassword, totp } = req.body;
  // verify current password AND a valid TOTP against the existing secret
  // before issuing a replacement
}
```

---

### WB-08 — No Content-Security-Policy on the served application — **Medium**

**File:** `healthvault_frontend/nginx.conf`

**OWASP:** A05:2021 Security Misconfiguration · ASVS V14.4.3

In production the React bundle is served by nginx, not Express. The nginx config sets `X-Content-Type-Options`, `X-Frame-Options: DENY`, and `Referrer-Policy` — but **no `Content-Security-Policy`.** The `helmet()` CSP configured in `server.ts:25` applies only to API responses, not to the HTML document the browser actually executes.

The application therefore has no script-source restriction — no mitigation layer should an XSS sink ever be introduced (see WB-04, WB-14).

**Fix:** Add to `nginx.conf`:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://www.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://localhost:5001; frame-src https://www.google.com; object-src 'none'; base-uri 'self'; form-action 'self'" always;
```

`frame-src`/`script-src` entries for `google.com` are required by the reCAPTCHA widget. Verify against the deployed origin before enforcing.

---

### WB-09 — No upload rate limit or per-user storage quota — **Medium**

**Files:** `healthcare-backned/src/routes/documentRoutes.ts:17`, `healthcare-backned/src/middleware/vaultUpload.ts:19`

**OWASP:** A04:2021 Insecure Design · ASVS V12.1.1

`POST /api/documents` is protected by `protect` but carries **no dedicated rate limiter** — only the 100-request/15-minute `globalLimiter`. With a 5 MB per-file cap and no aggregate quota, a single authenticated account can write roughly **500 MB per 15-minute window**, unbounded over time. Files are written to the container filesystem (`documentController.ts:36`); exhausting it takes down the API, the Winston log writer, and the upload path together.

**Fix:** Add a dedicated limiter (e.g. 20 uploads / 15 min) in `rateLimiter.ts` and enforce a cumulative quota before accepting the write:

```ts
const used = await DocumentModel.aggregate([
  { $match: { ownerId: new mongoose.Types.ObjectId(req.user.id) } },
  { $group: { _id: null, total: { $sum: '$size' } } },
]);
if ((used[0]?.total ?? 0) + req.file.size > MAX_VAULT_BYTES_PER_USER) {
  res.status(413).json({ message: 'Vault storage quota exceeded' });
  return;
}
```

---

### WB-10 — MFA-enabled accounts bypass CAPTCHA at login — **Low**

**File:** `healthcare-backned/src/controllers/authController.ts:139-153`

**OWASP:** A07:2021 · ASVS V2.2.1

```ts
const captchaRequired = !user || !user.mfaEnabled;
```

For an MFA-enabled account, **no CAPTCHA of either kind is enforced** on the login endpoint. The reasoning (TOTP gates the session anyway) is defensible for session security, but CAPTCHA's role here is to raise the cost of *automated password guessing* — and the password is still verified, and still the first factor, before MFA is ever reached.

An attacker can therefore automate password brute-forcing against MFA-enabled accounts without solving a challenge. Residual controls remain effective: `loginLimiter` (5/15 min, `rateLimiter.ts:23`), account lockout at 5 attempts (`authController.ts:184`), and `recordIpFailure` escalation to a 1-hour IP block. Severity is Low because those controls carry the weight — but the layer was removed from exactly the accounts an attacker most wants to profile (see WB-05).

**Fix:** Enforce CAPTCHA unconditionally on `/login`; keep the precheck endpoint only if it is decoupled from account state.

---

### WB-11 — Cookie `secure` attribute conditional on `NODE_ENV` — **Low**

**File:** `healthcare-backned/src/controllers/authController.ts:34-39`

**OWASP:** A05:2021 · ASVS V3.4.1

```ts
secure: process.env.NODE_ENV === 'production',
```

Correct and intentional for local HTTP development, but shares the single-variable fragility of WB-02: an unset or mistyped `NODE_ENV` in a real deployment causes the session cookie to be transmitted over plaintext HTTP. `httpOnly` and `sameSite: 'strict'` are unconditional and correct.

**Fix:** Fail closed — default to secure unless development is explicitly asserted:

```ts
secure: process.env.NODE_ENV !== 'development',
```

Add a startup assertion that refuses to boot in production without HTTPS-capable configuration.

---

### WB-12 — Stripe webhook consumes the global IP rate limit — **Low**

**File:** `healthcare-backned/src/server.ts` (limiter registration vs webhook route order)

**OWASP:** A04:2021 Insecure Design

`globalLimiter` is registered before the webhook route, and the webhook is therefore subject to it. All Stripe webhook deliveries originate from a small set of Stripe IPs and share one 100-request/15-minute budget. Under load, or when Stripe retries a batch, legitimate `checkout.session.completed` events receive HTTP 429 and payments silently fail to be recorded despite the customer having paid.

The raw-body ordering relative to `express.json()` is handled correctly — this is purely a middleware-ordering issue with the limiter.

**Fix:** Register the webhook route before `globalLimiter`, or exempt it:

```ts
skip: (req) => req.ipAllowlisted === true || req.path === '/api/payments/webhook',
```

---

### WB-13 — Unpaid appointments are fully functional — **Informational**

**Files:** `healthcare-backned/src/models/Appointment.ts:62-66`, `appointmentController.ts:76-92`

`paymentStatus` defaults to `'unpaid'` and **no code path requires it to become `'paid'`.** An appointment is booked, occupies the doctor's slot via the unique index, and appears on all dashboards regardless of payment. The deposit is effectively optional.

This may be the intended design (deposit as a soft commitment). Flagged so the intent is explicit in the report rather than assumed. If deposits are meant to be binding, hold the slot with a short TTL and release it if checkout is not completed.

---

### WB-14 — `dangerouslySetInnerHTML` used to render CAPTCHA SVG — **Informational**

**File:** `healthvault_frontend/src/components/TextCaptcha.tsx:51`

The only use of React's HTML-injection escape hatch in the codebase. The injected value is an SVG produced server-side by `svg-captcha` from a random string (`textCaptcha.ts:26-34`) — it is not user input, and the library does not embed caller-controlled content. SVG can carry `<script>`, so the sink is real, but there is no reachable path by which an attacker controls the value.

Accepted risk. Documented because it is the one place where an injection sink exists, and because WB-08 (absent CSP) means there would be no second line of defence if the source ever changed.

---

## 4. Per-area assessment

### 4.1 Authentication — findings: WB-02, WB-05, WB-07, WB-10

**Confirmed secure:**
- bcrypt with cost factor 12 and per-password salt (`models/User.ts:78-86`)
- Password never selected by default (`select: false`, `User.ts:50`); explicit `+password` required
- Account lockout: 5 attempts → 30-minute lock (`authController.ts:184-189`)
- Password history of 5 blocks reuse (`User.ts:93-101`, `userController.ts:190-196`)
- 90-day password expiry enforced server-side with correctly exempted routes (`authMiddleware.ts:105-118`)
- Uniform generic response on `forgot-password` / `magic-link` prevents registration enumeration (`authController.ts:370`, `507`)
- TOTP verified with `window: 1` — tight replay window (`authController.ts:303-308`)
- Dedicated OTP limiter, 5 per 5 minutes, correctly reasoned against the 10⁶ TOTP keyspace (`rateLimiter.ts:45-57`)
- `mfaPending` token is route-scoped to `/verify-mfa` only (`authMiddleware.ts:100-103`)
- Role whitelisted to `doctor|patient` at validation — `admin` cannot be self-assigned (`validateInput.ts:43-46`)

### 4.2 Authorization — findings: none

**Confirmed secure:**
- `authorizeRoles` RBAC middleware applied consistently on privileged routes (`roleMiddleware.ts:9-27`)
- Zero-trust `protect`: live user re-fetch on every request, never trusting token claims alone (`authMiddleware.ts:78-84`)
- Live lock-status recheck catches accounts locked after token issuance (`authMiddleware.ts:87-90`)
- Ownership enforced server-side on every object access: documents (`documentController.ts:109`, `165`), payments (`paymentController.ts:41`), appointments (`appointmentController.ts:175-185`)
- Doctors correctly scoped to their own schedule in `getAllAppointments` (`appointmentController.ts:247`)
- Self-service export hard-scoped to `req.user.id` — no user-supplied identifier accepted (`userController.ts:230`)
- Profile update uses an explicit field allowlist; `role`, `password`, lock state and MFA fields cannot be mass-assigned (`userController.ts:44-70`)

The vault being open to all authenticated roles rather than patients only (`documentRoutes.ts:13-20`) is a **deliberate, documented** decision with ownership as the real boundary. Correct — role-gating there would be redundant with, not additional to, the ownership check.

### 4.3 Input validation & XSS — findings: WB-04, WB-14

**Confirmed secure:**
- `express-validator` chains on all auth and appointment inputs (`validateInput.ts`)
- `express-mongo-sanitize` strips `$`/`.` operators — NoSQL injection prevented (`server.ts:37`)
- Mongoose schema types and `enum` constraints provide a second validation layer
- Body size capped at 10 kB (`server.ts:34-35`)
- `.escape()` applied to the free-text `name` field (`validateInput.ts:26`)
- React JSX auto-escapes all interpolated output — no XSS sink in any dashboard, appointment list, or profile view
- ObjectId format validated before every database lookup (`documentController.ts:99`, `155`; `appointmentController.ts:164`; `paymentController.ts:31`)
- Stored filenames are server-generated UUIDs; the original name never reaches the filesystem — **path traversal is structurally impossible** (`documentController.ts:34`)
- `Content-Disposition` correctly sanitised against header injection and quote breakout, with RFC 5987 `filename*` for the accurate name (`documentController.ts:127-135`)

No SQL is used anywhere in the application; SQL injection is not applicable. The equivalent risk (NoSQL operator injection) is addressed by `mongoSanitize` plus typed schemas.

### 4.4 Session handling — findings: WB-01, WB-03, WB-11

**Confirmed secure:**
- JWT held in an `httpOnly` cookie — unreadable by JavaScript (`authController.ts:34-44`)
- `sameSite: 'strict'` — CSRF is structurally mitigated for all state-changing routes
- **Token removed from all response bodies** — login, MFA verify, and magic-link verify now return only user display data (`authController.ts:227-235`, `328-336`, `462-470`)
- `localStorage` holds only non-sensitive display data under `hv_user`; no token (`frontend/src/utils/auth.ts:3-24`)
- Session bound to a SHA-256 User-Agent fingerprint — a replayed cookie from another client is rejected (`authMiddleware.ts:22-23`, `93-97`)
- Session lifetime 1 hour, matched between JWT `exp` and cookie `maxAge` (`authController.ts:15-16`)
- `withCredentials: true` with a concrete CORS origin and no wildcard (`axios.ts:12`, `server.ts:27-33`)

The client-side `hv_user.role` value drives navigation rendering only. Tampering with it in `localStorage` alters the UI but grants nothing — every privileged route re-derives role server-side from the database. This is the correct architecture and is worth demonstrating explicitly during dynamic testing.

### 4.5 Business logic — findings: WB-06, WB-13

**Confirmed secure:**
- Double-booking prevented by **two independent mechanisms**: an ACID transaction around check-then-insert (`appointmentController.ts:53-94`) and a partial unique index that lets the database reject the loser of any race (`models/Appointment.ts:85-88`). Exemplary.
- Cancelled appointments excluded from the index so freed slots are rebookable
- **Deposit amount is server-side only** — read from `DEPOSIT_AMOUNT` env config at booking time (`appointmentController.ts:87`, `utils/stripe.ts:5`). The client never supplies a price. Price-manipulation via request tampering is not possible.
- Amount snapshotted at booking, so later config changes don't retroactively alter existing debts
- Checkout blocked on cancelled and already-paid appointments (`paymentController.ts:46-53`)
- Past-dated bookings rejected with a 24-hour tolerance (`validateInput.ts:73-79`)

### 4.6 API security — findings: WB-09, WB-12

**Confirmed secure:**
- `helmet()` security headers on all API responses (`server.ts:25`)
- CORS locked to a single configured origin with credentials — no wildcard (`server.ts:27-33`)
- Layered rate limiting: global 100/15min, login 5/15min, OTP 5/5min, register 10/15min (`rateLimiter.ts`)
- Independent per-IP failure tracker escalating to a 1-hour hard block (`ipAccessControl.ts:36-53`)
- **Stripe webhook signature verified against raw bytes** before any processing (`paymentController.ts:110`), with `express.raw()` correctly ordered before the JSON parser. Forged payment events are rejected.
- Webhook handler is **idempotent** — re-delivery cannot double-apply (`paymentController.ts:137`)
- Correct retry semantics: 200 on unprocessable events, 500 only on genuine server faults (`paymentController.ts:125`, `152`)
- Card data never touches the application — Stripe-hosted Checkout redirect keeps PCI-DSS scope out of the codebase
- Error responses are generic; stack traces are logged server-side, never returned (`server.ts:100-103`)
- Secrets are environment-sourced; `.env` is git-ignored and confirmed **untracked**; `uploads/` is git-ignored

### 4.7 Client-side — findings: WB-08, WB-14

**Confirmed secure:**
- No authentication token in any JS-accessible storage (see §4.4)
- `X-Frame-Options: DENY` on the frontend — **clickjacking mitigated** (`nginx.conf`)
- `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` set (`nginx.conf`)
- No `eval`, no `Function()` constructor, no `innerHTML` anywhere in the frontend source
- Automatic session cleanup and redirect on 401 (`axios.ts:32-37`)
- Password-expiry 403 handled as a distinct, non-destructive flow (`axios.ts:25-30`)
- Multi-stage Docker builds ship only production dependencies
- CI enforces `npm audit --audit-level=high` on both applications (`.github/workflows/ci.yml`)

---

## 5. Readiness for penetration testing

The application is **ready to proceed to dynamic (black-box) testing.** The architecture is sound and the great majority of controls are correctly implemented — the findings above are specific, bounded defects rather than systemic weaknesses.

No finding is severe enough to block testing, and none should be remediated before the penetration test: the black-box phase must confirm these findings independently from outside the source, which is the point of running both methodologies.

**Priority hypotheses to confirm dynamically in Phase 4:**

| Finding | Dynamic test to run | Burp tool |
|---------|--------------------|-----------|
| WB-01 | Capture session cookie → reset password → replay original cookie | Repeater |
| WB-02 | `POST /forgot-password` and inspect response body for `devResetLink` | Repeater |
| WB-03 | Capture cookie → logout → replay cookie against `/api/users/profile` | Repeater |
| WB-04 | Upload HTML content with `Content-Type: application/pdf`; inspect download response headers | Proxy + Repeater |
| WB-05 | `POST /login-precheck` with known-MFA and known-non-MFA emails; compare | Repeater / Intruder |
| WB-06 | Concurrent cancel requests on one paid appointment | Repeater (parallel send / group) |
| WB-07 | `POST /enable-mfa` on an already-MFA-enabled session | Repeater |
| WB-08 | Inspect response headers from the nginx-served frontend | Proxy |
| WB-09 | Repeat uploads past 20; observe absence of throttling | Intruder |
| WB-10 | `POST /login` for an MFA account with no CAPTCHA fields | Repeater |

**Controls to positively demonstrate as effective** (negative results are evidence too, and earn marks):
lockout after 5 attempts · NoSQL operator injection rejected · IDOR blocked on `/documents/:id/download` with another user's id · client-side `hv_user.role` tampering yields no privilege · forged Stripe webhook rejected on signature · concurrent booking of one slot rejected by the unique index.

---

## 6. Remediation sequencing

Fix **after** the penetration test completes, so each finding has a found → fixed → retested trail:

1. WB-01, WB-03 — single change (`tokenVersion` / `pwdVersion` in `signToken` + `protect`) closes both
2. WB-02, WB-11 — fail-closed environment handling
3. WB-06 — atomic cancel via `findOneAndUpdate` + Stripe idempotency key
4. WB-04, WB-09 — upload hardening: magic-byte validation, quota, dedicated limiter
5. WB-07 — step-up authentication on MFA re-enrolment
6. WB-05, WB-10 — unconditional login CAPTCHA
7. WB-08, WB-12 — CSP header, webhook limiter exemption
