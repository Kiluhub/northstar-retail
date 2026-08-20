import amqp, { Channel, ChannelModel } from "amqplib";

export const INVENTORY_EXCHANGE = "northstar.inventory";

export const INVENTORY_QUEUE = "inventory.worker";

export const INVENTORY_ROUTING_KEY = "inventory.changed";

let connection: ChannelModel | null = null;

let channel: Channel | null = null;

export async function getRabbitChannel(): Promise<Channel> {
  // Read the environment variable when the connection is actually requested.
  const rabbitmqUrl = process.env.RABBITMQ_URL;

  // Fail immediately with a useful error instead of silently falling
  // back to localhost.
  if (!rabbitmqUrl) {
    throw new Error(
      "RABBITMQ_URL is not configured. Check apps/warehouse/.env.local"
    );
  }

  // Reuse the existing channel if the worker already connected.
  if (channel) {
    return channel;
  }

  console.log("Connecting to RabbitMQ...");

  // Connect to the hosted RabbitMQ service.
  connection = await amqp.connect(rabbitmqUrl);

  console.log("Connected to RabbitMQ");

  // Create an AMQP channel.
  channel = await connection.createChannel();

  // Create the Northstar inventory exchange.
  await channel.assertExchange(
    INVENTORY_EXCHANGE,
    "topic",
    {
      durable: true,
    }
  );

  // Create the inventory worker queue.
  await channel.assertQueue(
    INVENTORY_QUEUE,
    {
      durable: true,
    }
  );

  // Route inventory.changed events into the worker queue.
  await channel.bindQueue(
    INVENTORY_QUEUE,
    INVENTORY_EXCHANGE,
    INVENTORY_ROUTING_KEY
  );

  console.log(
    `RabbitMQ ready: ${INVENTORY_EXCHANGE} → ${INVENTORY_QUEUE}`
  );

  return channel;
}