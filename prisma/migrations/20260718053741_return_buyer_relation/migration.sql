-- CreateIndex
CREATE INDEX "ReturnRequest_buyerId_idx" ON "ReturnRequest"("buyerId");

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
