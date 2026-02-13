-- CreateTable
CREATE TABLE "TokenInfo" (
    "mint" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "decimals" INTEGER NOT NULL,
    "logoURI" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "TokenInfo_symbol_idx" ON "TokenInfo"("symbol");
