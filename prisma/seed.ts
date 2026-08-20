import {
  PrismaClient,
  InventoryEventType,
  SyncStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const warehouses = [
  {
    code: "NBO-01",
    name: "Northstar Nairobi Fulfillment Center",
    location: "Nairobi, Kenya",
  },
  {
    code: "MSA-01",
    name: "Northstar Mombasa Distribution Center",
    location: "Mombasa, Kenya",
  },
];

const products = [
  {
    sku: "NS-A15-128",
    name: "Samsung Galaxy A15 128GB",
    barcode: "890123450001",
  },
  {
    sku: "NS-IP15-128",
    name: "Apple iPhone 15 128GB",
    barcode: "890123450002",
  },
  {
    sku: "NS-REDMI13",
    name: "Xiaomi Redmi 13",
    barcode: "890123450003",
  },
  {
    sku: "NS-HP450-G10",
    name: "HP ProBook 450 G10",
    barcode: "890123450004",
  },
  {
    sku: "NS-LEN-T14",
    name: "Lenovo ThinkPad T14",
    barcode: "890123450005",
  },
  {
    sku: "NS-LOG-MX3",
    name: "Logitech MX Master 3S",
    barcode: "890123450006",
  },
  {
    sku: "NS-JBL-520",
    name: "JBL Tune 520BT Headphones",
    barcode: "890123450007",
  },
  {
    sku: "NS-NIKE-A42",
    name: "Nike Air Max Size 42",
    barcode: "890123450008",
  },
  {
    sku: "NS-ADIDAS-U42",
    name: "Adidas Runfalcon Size 42",
    barcode: "890123450009",
  },
  {
    sku: "NS-ANKER-20K",
    name: "Anker Power Bank 20000mAh",
    barcode: "890123450010",
  },
];

const stockLevels: Record<string, { NBO: number; MSA: number }> = {
  "NS-A15-128": { NBO: 120, MSA: 48 },
  "NS-IP15-128": { NBO: 42, MSA: 15 },
  "NS-REDMI13": { NBO: 86, MSA: 32 },
  "NS-HP450-G10": { NBO: 28, MSA: 9 },
  "NS-LEN-T14": { NBO: 19, MSA: 7 },
  "NS-LOG-MX3": { NBO: 55, MSA: 21 },
  "NS-JBL-520": { NBO: 74, MSA: 26 },
  "NS-NIKE-A42": { NBO: 63, MSA: 18 },
  "NS-ADIDAS-U42": { NBO: 47, MSA: 13 },
  "NS-ANKER-20K": { NBO: 91, MSA: 35 },
};

async function main() {
  console.log("Seeding Northstar Retail...");

  // Clean seed-owned data so the script can safely be rerun.
  await prisma.inventoryCache.deleteMany();
  await prisma.processedEvent.deleteMany();
  await prisma.inventoryEvent.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  const createdWarehouses = await Promise.all(
    warehouses.map((warehouse) =>
      prisma.warehouse.create({
        data: warehouse,
      }),
    ),
  );

  const createdProducts = await Promise.all(
    products.map((product) =>
      prisma.product.create({
        data: product,
      }),
    ),
  );

  for (const warehouse of createdWarehouses) {
    const warehouseKey = warehouse.code.startsWith("NBO")
      ? "NBO"
      : "MSA";

    for (const product of createdProducts) {
      const quantity = stockLevels[product.sku][warehouseKey];
      const reservedQuantity = Math.min(
        Math.floor(quantity * 0.12),
        quantity,
      );

      await prisma.inventory.create({
        data: {
          warehouseId: warehouse.id,
          productId: product.id,
          physicalQuantity: quantity,
          reservedQuantity,
        },
      });

      const eventId = `SEED-${warehouse.code}-${product.sku}`;

      await prisma.inventoryEvent.create({
        data: {
          eventId,
          type: InventoryEventType.STOCK_RECEIVED,
          warehouseId: warehouse.id,
          productId: product.id,
          quantityDelta: quantity,
          reference: `INITIAL-${warehouse.code}`,
          reason: "Initial warehouse stock",
          source: "SEED",
          occurredAt: new Date(),
          syncStatus: SyncStatus.SYNCED,
        },
      });

      await prisma.inventoryCache.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          physicalQuantity: quantity,
          reservedQuantity,
          availableQuantity: quantity - reservedQuantity,
          lastEventId: eventId,
          lastUpdatedAt: new Date(),
        },
      });
    }
  }

  console.log("Seed complete.");
  console.log(`Warehouses: ${createdWarehouses.length}`);
  console.log(`Products: ${createdProducts.length}`);
  console.log("Inventory records: 20");
  console.log("Inventory events: 20");
  console.log("Inventory cache records: 20");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });