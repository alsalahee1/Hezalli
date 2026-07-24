-- Passwordless (biometric) login: pre-auth WebAuthn challenge, not tied to a user.

CREATE TABLE "LoginWebauthnChallenge" (
    "id" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginWebauthnChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoginWebauthnChallenge_challenge_key" ON "LoginWebauthnChallenge"("challenge");
CREATE INDEX "LoginWebauthnChallenge_expiresAt_idx" ON "LoginWebauthnChallenge"("expiresAt");
