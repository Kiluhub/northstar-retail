
import { prisma } from "../lib/prisma";
import {
  getRabbitChannel,
  INVENTORY_QUEUE,
} from "../lib/rabbitmq";

async function startWorker() {
  const channel = await getRabbitChannel();

  console.log(`Inventory worker listening on ${INVENTORY_QUEUE}`);

  await channel.prefetch(10);

  channel.consume(INVENTORY_QUEUE, async (message) => {
    if (!message) return;

    try {
      const event = JSON.parse(message.content.toString());

      console.log("Received inventory event:", event.eventId);

      // Idempotency check
      const alreadyProcessed =
        await prisma.processedEvent.findUnique({
          where: {
            eventId: event.eventId,
          },
        });

      if (alreadyProcessed) {
        console.log(
          `Event ${event.eventId} already processed`
        );

        channel.ack(message);
        return;
      }

      // Find the inventory record
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

      const newPhysicalQuantity =
        inventory.physicalQuantity + event.quantityDelta;

      if (newPhysicalQuantity < 0) {
        throw new Error(
          `Inventory cannot become negative for product ${event.productId}`
        );
      }

      // Update inventory and record processed event atomically
      await prisma.$transaction(async (tx) => {
        await tx.inventory.update({
          where: {
            id: inventory.id,
          },
          data: {
            physicalQuantity: newPhysicalQuantity,
          },
        });

        const availableQuantity =
          newPhysicalQuantity -
          inventory.reservedQuantity;

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

        await tx.processedEvent.create({
          data: {
            eventId: event.eventId,
            eventType: event.type,
          },
        });

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

      channel.ack(message);
    } catch (error) {
      console.error("Inventory worker error:", error);

      /*
       * Do not acknowledge the message.
       *
       * RabbitMQ can redeliver it according to the
       * queue's retry/dead-letter configuration.
       */
      channel.nack(message, false, false);
    }
  });
}

startWorker().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
