import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { prisma } from "@/lib/prisma";
import { publishInventoryEvent } from "@/lib/rabbitmq";

const EVENT_TYPES = {
  receive: "STOCK_RECEIVED",
  pick: "STOCK_PICKED",
  ship: "STOCK_SHIPPED",
  adjust: "STOCK_ADJUSTED",
} as const;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      warehouseId,
      productId,
      quantityDelta,
      operation,
      reference,
      reason,
    } = body;

    // ---------------------------------------------------------
    // 1. Validate the data received from the warehouse UI
    // ---------------------------------------------------------

    if (
      !warehouseId ||
      !productId ||
      !operation ||
      typeof quantityDelta !== "number"
    ) {
      return NextResponse.json(
        {
          error: "Missing or invalid inventory event data.",
        },
        { status: 400 }
      );
    }

    if (!(operation in EVENT_TYPES)) {
      return NextResponse.json(
        {
          error: "Unsupported inventory operation.",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 2. Find the warehouse using the code sent by the UI
    // ---------------------------------------------------------

    const warehouse = await prisma.warehouse.findUnique({
      where: {
        code: warehouseId,
      },
    });

    // ---------------------------------------------------------
    // 3. Find the product using its SKU
    // ---------------------------------------------------------

    const product = await prisma.product.findUnique({
      where: {
        sku: productId,
      },
    });

    if (!warehouse || !product) {
      return NextResponse.json(
        {
          error: "Warehouse or product not found.",
        },
        { status: 404 }
      );
    }

    // ---------------------------------------------------------
    // 4. Make sure the inventory record exists
    // ---------------------------------------------------------

    const inventory = await prisma.inventory.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: warehouse.id,
          productId: product.id,
        },
      },
    });

    if (!inventory) {
      return NextResponse.json(
        {
          error: "Inventory record not found.",
        },
        { status: 404 }
      );
    }

    // ---------------------------------------------------------
    // 5. Check that the operation would not create
    //    negative physical stock
    // ---------------------------------------------------------

    const newQuantity =
      inventory.physicalQuantity + quantityDelta;

    if (newQuantity < 0) {
      return NextResponse.json(
        {
          error: `Insufficient stock. Current physical quantity: ${inventory.physicalQuantity}`,
        },
        { status: 409 }
      );
    }

    // ---------------------------------------------------------
    // 6. Create a unique ID for this inventory event
    // ---------------------------------------------------------

    const eventId = randomUUID();

    // ---------------------------------------------------------
    // 7. Store the event in PostgreSQL first
    //
    //    It starts as PENDING because the worker has not
    //    processed it yet.
    // ---------------------------------------------------------

    const event = await prisma.inventoryEvent.create({
      data: {
        eventId,

        type: EVENT_TYPES[
          operation as keyof typeof EVENT_TYPES
        ],

        warehouseId: warehouse.id,
        productId: product.id,

        quantityDelta,

        reference: reference || null,
        reason: reason || null,

        source: "warehouse-ui",

        occurredAt: new Date(),

        syncStatus: "PENDING",
      },
    });

    // ---------------------------------------------------------
    // 8. Publish the event to RabbitMQ
    //
    //    publishInventoryEvent() waits for RabbitMQ to confirm
    //    that it accepted the message.
    //
    //    The inventory worker will consume this event and
    //    update the actual inventory record.
    // ---------------------------------------------------------

    await publishInventoryEvent({
      eventId: event.eventId,
      type: event.type,

      warehouseId: event.warehouseId,
      productId: event.productId,

      quantityDelta: event.quantityDelta,

      reference: event.reference,
      reason: event.reason,

      source: event.source,

      occurredAt: event.occurredAt,
    });

    // ---------------------------------------------------------
    // 9. Return success to the warehouse UI
    //
    //    The event is still PENDING here because the worker
    //    has not necessarily processed it yet.
    // ---------------------------------------------------------

    return NextResponse.json(
      {
        success: true,
        eventId,
        status: "PENDING",
      },
      { status: 201 }
    );
  } catch (error) {
    // ---------------------------------------------------------
    // Any unexpected error is logged here.
    // ---------------------------------------------------------

    console.error(
      "Inventory event error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to create inventory event.",
      },
      { status: 500 }
    );
  }
}