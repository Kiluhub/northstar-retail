
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getRabbitChannel,
  INVENTORY_EXCHANGE,
  INVENTORY_ROUTING_KEY,
} from "@/lib/rabbitmq";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      eventId,
      type,
      warehouseId,
      productId,
      quantityDelta,
      reference,
      reason,
      occurredAt,
    } = body;

    if (
      !eventId ||
      !type ||
      !warehouseId ||
      !productId ||
      typeof quantityDelta !== "number"
    ) {
      return NextResponse.json(
        { error: "Invalid inventory event" },
        { status: 400 }
      );
    }

    // Prevent duplicate events
    const existing = await prisma.inventoryEvent.findUnique({
      where: { eventId },
    });

    if (existing) {
      return NextResponse.json({
        accepted: true,
        duplicate: true,
        eventId,
      });
    }

    // Record the event
    const event = await prisma.inventoryEvent.create({
      data: {
        eventId,
        type,
        warehouseId,
        productId,
        quantityDelta,
        reference,
        reason,
        source: "WAREHOUSE_WEBHOOK",
        occurredAt: occurredAt
          ? new Date(occurredAt)
          : new Date(),
      },
    });

    // Publish to RabbitMQ
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
        })
      ),
      {
        persistent: true,
        contentType: "application/json",
      }
    );

    return NextResponse.json(
      {
        accepted: true,
        eventId: event.eventId,
        status: event.syncStatus,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("Inventory webhook error:", error);

    return NextResponse.json(
      { error: "Failed to process inventory event" },
      { status: 500 }
    );
  }
}

