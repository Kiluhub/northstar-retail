
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { prisma } from "@/lib/prisma";
import {
  getRabbitChannel,
  INVENTORY_EXCHANGE,
  INVENTORY_ROUTING_KEY,
} from "@/lib/rabbitmq";

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

    // Basic validation
    if (
      !warehouseId ||
      !productId ||
      !operation ||
      typeof quantityDelta !== "number"
    ) {
      return NextResponse.json(
        { error: "Missing or invalid inventory event data." },
        { status: 400 }
      );
    }

    if (!(operation in EVENT_TYPES)) {
      return NextResponse.json(
        { error: "Unsupported inventory operation." },
        { status: 400 }
      );
    }

    // Find the actual warehouse and product.
    // The UI currently sends their codes/SKUs.
    const warehouse = await prisma.warehouse.findUnique({
      where: {
        code: warehouseId,
      },
    });

    const product = await prisma.product.findUnique({
      where: {
        sku: productId,
      },
    });

    if (!warehouse || !product) {
      return NextResponse.json(
        { error: "Warehouse or product not found." },
        { status: 404 }
      );
    }

    // Make sure the inventory record exists.
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
        { error: "Inventory record not found." },
        { status: 404 }
      );
    }

    // Prevent stock from becoming negative.
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

    const eventId = randomUUID();

    // First record the event in PostgreSQL.
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

    // Publish the event to RabbitMQ.
    const channel = await getRabbitChannel();

    channel.publish(
      INVENTORY_EXCHANGE,
      INVENTORY_ROUTING_KEY,
      Buffer.from(
        JSON.stringify({
          eventId: event.eventId,
          type: event.type,
          warehouseId: event.warehouseId,
          productId: event.productId,
          quantityDelta: event.quantityDelta,
          reference: event.reference,
          reason: event.reason,
          source: event.source,
          occurredAt: event.occurredAt,
        })
      ),
      {
        persistent: true,
        contentType: "application/json",
      }
    );

    return NextResponse.json(
      {
        success: true,
        eventId,
        status: "PENDING",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Inventory event error:", error);

    return NextResponse.json(
      {
        error: "Failed to create inventory event.",
      },
      { status: 500 }
    );
  }
}
