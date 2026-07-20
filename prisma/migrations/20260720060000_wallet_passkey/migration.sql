-- Biometric step-up via WebAuthn / passkeys (Step 21).

CREATE TABLE "WalletCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "WalletCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletCredential_credentialId_key" ON "WalletCredential"("credentialId");
CREATE INDEX "WalletCredential_userId_idx" ON "WalletCredential"("userId");

ALTER TABLE "WalletCredential"
    ADD CONSTRAINT "WalletCredential_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WalletWebauthnChallenge" (
    "userId" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletWebauthnChallenge_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "WalletWebauthnChallenge"
    ADD CONSTRAINT "WalletWebauthnChallenge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
