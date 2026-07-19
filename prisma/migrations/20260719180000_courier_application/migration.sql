-- Self-serve "become a driver" applications. Approval grants the COURIER role
-- (done in the app, admin-gated) — the role is never self-granted here.

-- CreateEnum
CREATE TYPE "CourierApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "CourierApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "governorate" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "notes" TEXT,
    "status" "CourierApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourierApplication_userId_key" ON "CourierApplication"("userId");

-- CreateIndex
CREATE INDEX "CourierApplication_status_idx" ON "CourierApplication"("status");

-- AddForeignKey
ALTER TABLE "CourierApplication" ADD CONSTRAINT "CourierApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
