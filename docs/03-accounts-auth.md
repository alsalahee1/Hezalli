# 03 — Phase 3: Accounts & Authentication

**Goal:** Buyers (and future sellers) can register, verify, log in, manage their profile and delivery addresses.
**Prerequisite:** Phase 2 complete.

---

## Step 3.1 — Registration & login 🧠

- Set up **Auth.js (NextAuth v5)** with credentials (email + password) — passwords hashed with bcrypt/argon2
- **Register page**: name, email, password (+ confirm), accept-terms checkbox; validation with clear error messages
- **Login page**: email + password, "remember me", link to forgot password
- Logout
- Session available across the app (header shows user name / avatar when logged in)
- Every new user starts with role **BUYER**
- Protect `/seller/*` and `/admin/*` routes by role (redirect to login / 403 page)

✅ **Acceptance criteria**
- [ ] Can register a new account, log out, log back in
- [ ] Wrong password shows a friendly error
- [ ] Visiting `/admin` as a buyer is blocked; the seeded admin can enter

> **🔜 NEXT-STEP CARD**
> - **Next step:** 3.2 — Email verification & password reset
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/03-accounts-auth.md.
> Step 3.1 (register/login) is done. Do Step 3.2: email verification and
> password reset using Resend, as described. Commit, push, then show me
> the Next-Step Card for 3.3.
> ```

---

## Step 3.2 — Email verification & password reset

- Sign up for **Resend** (free tier); put the API key in `.env`
- On registration: send a verification email with a tokenized link; "verify your email" banner until verified
- **Forgot password**: request page → email with reset link → set new password page; tokens expire (e.g. 1 hour) and are single-use
- A resend-verification button with rate limiting

✅ **Acceptance criteria**
- [ ] Real verification email arrives and the link verifies the account
- [ ] Password reset works end-to-end; used/expired links are rejected

> **🔜 NEXT-STEP CARD**
> - **Next step:** 3.3 — Google login (optional but recommended)
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Low
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/03-accounts-auth.md.
> Steps 3.1–3.2 are done. Do Step 3.3: add Google OAuth login via
> Auth.js and guide me through creating the Google Cloud credentials.
> Commit, push, then show me the Next-Step Card for 3.4.
> ```

---

## Step 3.3 — Google login

- Add Google provider to Auth.js (Claude guides you through creating OAuth credentials in Google Cloud Console)
- "Continue with Google" button on login + register pages
- Link Google accounts to existing accounts with the same email safely

✅ **Acceptance criteria**
- [ ] Can sign in with a real Google account

> **🔜 NEXT-STEP CARD**
> - **Next step:** 3.4 — Profile & addresses
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session (or new if this one is long)
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/03-accounts-auth.md.
> Steps 3.1–3.3 are done. Do Step 3.4: the account area — profile edit,
> avatar upload, delivery address book (CRUD, default address), phone
> field, password change, account deletion. Commit, push, then show me
> the Next-Step Card for Phase 4.
> ```

---

## Step 3.4 — Profile & address book

Account area at `/account`:

- **Profile**: edit name, phone number, avatar upload (this is your first file upload — set up the S3/R2 bucket now; Claude guides you)
- **Address book**: add/edit/delete delivery addresses (label, recipient name, phone, country/city/district, street, postal code, notes); mark one as default — *checkout will use these in Phase 8*
- **Security**: change password (requires current password)
- **Delete account** (with confirmation; soft-delete in DB)
- Account menu in the header links to: Profile, Orders (placeholder), Wishlist (placeholder), Addresses, Logout

✅ **Acceptance criteria**
- [ ] Avatar upload works and displays in the header
- [ ] Can manage multiple addresses and set a default
- [ ] Password change and account deletion work

> **🔜 NEXT-STEP CARD — PHASE 3 COMPLETE 🎉**
> - **Next step:** Phase 4, Step 4.1 — "Become a seller" application
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–3 are done (auth,
> profiles, addresses all working). Read docs/DECISIONS.md and
> docs/04-seller-onboarding.md, review the existing code briefly, then
> implement Step 4.1 exactly as described. Commit, push, then show me
> the Next-Step Card for 4.2.
> ```
