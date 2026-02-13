/*
  Warnings:

  - You are about to drop the `CostBasis` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CostBasis";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "inputMint" TEXT NOT NULL,
    "outputMint" TEXT NOT NULL,
    "inputSymbol" TEXT,
    "outputSymbol" TEXT,
    "inputAmount" TEXT NOT NULL,
    "outputAmount" TEXT NOT NULL,
    "inputUsdPrice" TEXT,
    "outputUsdPrice" TEXT,
    "inputUsdValue" TEXT,
    "outputUsdValue" TEXT,
    "type" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Trade_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Trade_walletId_executedAt_idx" ON "Trade"("walletId", "executedAt");

-- CreateIndex
CREATE INDEX "Trade_walletId_outputMint_idx" ON "Trade"("walletId", "outputMint");

-- CreateIndex
CREATE INDEX "Trade_walletId_inputMint_idx" ON "Trade"("walletId", "inputMint");

-- CreateIndex
CREATE INDEX "Trade_signature_idx" ON "Trade"("signature");
