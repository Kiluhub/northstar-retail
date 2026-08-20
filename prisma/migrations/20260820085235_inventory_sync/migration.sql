-- CreateEnum
CREATE TYPE "InventoryEventType" AS ENUM ('STOCK_RECEIVED', 'STOCK_PICKED', 'STOCK_SHIPPED', 'STOCK_RESERVED', 'STOCK_RELEASED', 'STOCK_ADJUSTED', 'STOCK_DAMAGED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'PROCESSING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncMode" AS ENUM ('POLLING', 'WEBHOOK');

-- CreateTable
CREATE TABLE "inventory_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "InventoryEventType" NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "reference" TEXT,
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "inventory_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "mode" "SyncMode" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "itemsFetched" INTEGER NOT NULL DEFAULT 0,
    "itemsChanged" INTEGER NOT NULL DEFAULT 0,
    "status" "SyncStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_cache" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "physicalQuantity" INTEGER NOT NULL,
    "reservedQuantity" INTEGER NOT NULL,
    "availableQuantity" INTEGER NOT NULL,
    "lastEventId" TEXT,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_events_eventId_key" ON "inventory_events"("eventId");

-- CreateIndex
CREATE INDEX "inventory_events_productId_occurredAt_idx" ON "inventory_events"("productId", "occurredAt");

-- CreateIndex
CREATE INDEX "inventory_events_warehouseId_occurredAt_idx" ON "inventory_events"("warehouseId", "occurredAt");

-- CreateIndex
CREATE INDEX "inventory_events_syncStatus_idx" ON "inventory_events"("syncStatus");

-- CreateIndex
CREATE INDEX "sync_runs_mode_startedAt_idx" ON "sync_runs"("mode", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_eventId_key" ON "processed_events"("eventId");

-- CreateIndex
CREATE INDEX "inventory_cache_productId_idx" ON "inventory_cache"("productId");

-- CreateIndex
CREATE INDEX "inventory_cache_warehouseId_idx" ON "inventory_cache"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_cache_productId_warehouseId_key" ON "inventory_cache"("productId", "warehouseId");

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_cache" ADD CONSTRAINT "inventory_cache_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
