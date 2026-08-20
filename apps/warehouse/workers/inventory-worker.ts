import dotenv from "dotenv";

// The worker runs outside Next.js, so Next.js does not automatically
// load .env.local for us.
dotenv.config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import {
  getRabbitChannel,
  INVENTORY_QUEUE,
} from "../lib/rabbitmq";

/**
 * Inventory Worker
 *
 * Responsibility:
 * 1. Listen for inventory events from RabbitMQ.
 * 2. Ignore events that have already been processed.
 * 3. Update the authoritative Inventory record.
 * 4. Update InventoryCache used for fast stock queries.
 * 5. Record the event as processed.
 * 6. Mark the InventoryEvent as SYNCED.
 *
 * The database operations are performed inside one transaction so
 * inventory cannot be updated without its corresponding cache/event
 * records also being updated.
 */
async function startWorker() {
  const channel = await getRabbitChannel();

  console.log(
    `Inventory worker listening on queue: ${INVENTORY_QUEUE}`
  );

  // Only allow up to 10 unacknowledged messages at a time.
  // This prevents the worker from taking an unlimited number of events.
  await channel.prefetch(10);

  channel.consume(INVENTORY_QUEUE, async (message) => {
    // RabbitMQ can occasionally deliver a null message.
    if (!message) return;

    try {
      // Convert the RabbitMQ message from Buffer → JSON object.
      const event = JSON.parse(message.content.toString());

      console.log(
        `Received inventory event: ${event.eventId}`
      );

      /**
       * IDEMPOTENCY
       *
       * RabbitMQ may redeliver a message.
       * We therefore check whether this event has already been
       * successfully processed before changing inventory.
       */
      const alreadyProcessed =
        await prisma.processedEvent.findUnique({
          where: {
            eventId: event.eventId,
          },
        });

      if (alreadyProcessed) {
        console.log(
          `Event ${event.eventId} already processed — skipping`
        );

        // Tell RabbitMQ that this message has been handled.
        channel.ack(message);

        return;
      }

      /**
       * FIND INVENTORY
       *
       * Every warehouse/product combination must already exist
       * in our inventory table.
       */
      const inventory = await prisma.inventory.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: event.warehouseId,
            productId: event.productId,
          },
        },
      });

      if (!inventory) {
        throw new Error(
          `Inventory record not found for warehouse ${event.warehouseId} and product ${event.productId}`
        );
      }

      /**
       * CALCULATE NEW STOCK
       *
       * quantityDelta can be positive or negative.
       *
       * Example:
       * physicalQuantity = 100
       * quantityDelta    = +25
       * new quantity     = 125
       */
      const newPhysicalQuantity =
        inventory.physicalQuantity + event.quantityDelta;

      // Stock must never become negative.
      if (newPhysicalQuantity < 0) {
        throw new Error(
          `Inventory cannot become negative for product ${event.productId}`
        );
      }

      /**
       * ATOMIC DATABASE UPDATE
       *
       * All of these operations succeed together or fail together:
       *
       * Inventory
       * InventoryCache
       * ProcessedEvent
       * InventoryEvent status
       */
      await prisma.$transaction(async (tx) => {
        // 1. Update the authoritative inventory quantity.
        await tx.inventory.update({
          where: {
            id: inventory.id,
          },
          data: {
            physicalQuantity: newPhysicalQuantity,
          },
        });

        // Available stock = physical stock - reserved stock.
        const availableQuantity =
          newPhysicalQuantity -
          inventory.reservedQuantity;

        // 2. Update/create the fast-read inventory cache.
        await tx.inventoryCache.upsert({
          where: {
            productId_warehouseId: {
              productId: event.productId,
              warehouseId: event.warehouseId,
            },
          },
          create: {
            productId: event.productId,
            warehouseId: event.warehouseId,
            physicalQuantity: newPhysicalQuantity,
            reservedQuantity: inventory.reservedQuantity,
            availableQuantity,
            lastEventId: event.eventId,
            lastUpdatedAt: new Date(),
          },
          update: {
            physicalQuantity: newPhysicalQuantity,
            reservedQuantity: inventory.reservedQuantity,
            availableQuantity,
            lastEventId: event.eventId,
            lastUpdatedAt: new Date(),
          },
        });

        // 3. Record the event so it cannot be processed twice.
        await tx.processedEvent.create({
          data: {
            eventId: event.eventId,
            eventType: event.type,
          },
        });

        // 4. Mark the original inventory event as synchronized.
        await tx.inventoryEvent.update({
          where: {
            eventId: event.eventId,
          },
          data: {
            syncStatus: "SYNCED",
          },
        });
      });

      console.log(
        `Event ${event.eventId} processed successfully`
      );

      /**
       * ACK
       *
       * Everything succeeded, so RabbitMQ can remove the message
       * from the queue.
       */
      channel.ack(message);

    } catch (error) {
      console.error(
        "Inventory worker error:",
        error
      );

      /**
       * NACK
       *
       * We deliberately do NOT acknowledge failed messages.
       *
       * With the current configuration, false means:
       * - don't requeue this message
       *
       * Later, when we configure a dead-letter/retry queue,
       * failed events can be retried automatically instead.
       */
      channel.nack(message, false, false);
    }
  });
}

// Start the worker and report startup failures.
startWorker().catch((error) => {
  console.error(
    "Worker failed to start:",
    error
  );

  process.exit(1);
});