-- Driver badges (lib/courier-badges.ts): one row per badge a courier has
-- earned. Awards are permanent; the unique pair makes the sync idempotent.

-- CreateTable
CREATE TABLE "CourierBadgeAward" (
    "id" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourierBadgeAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourierBadgeAward_courierId_badgeId_key" ON "CourierBadgeAward"("courierId", "badgeId");
