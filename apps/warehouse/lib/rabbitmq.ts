import amqp, { Channel, ChannelModel } from "amqplib";

const RABBITMQ_URL = process.env.RABBITMQ_URL!;

export const INVENTORY_EXCHANGE = "northstar.inventory";
export const INVENTORY_QUEUE = "inventory.worker";
export const INVENTORY_ROUTING_KEY = "inventory.changed";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export async function getRabbitChannel() {
  if (channel) {
    return channel;
  }

  connection = await amqp.connect(RABBITMQ_URL);

  channel = await connection.createChannel();

  await channel.assertExchange(INVENTORY_EXCHANGE, "topic", {
    durable: true,
  });

  await channel.assertQueue(INVENTORY_QUEUE, {
    durable: true,
  });

  await channel.bindQueue(
    INVENTORY_QUEUE,
    INVENTORY_EXCHANGE,
    INVENTORY_ROUTING_KEY
  );

  return channel;
}
