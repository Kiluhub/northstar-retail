import amqp, {
  ConfirmChannel,
  ChannelModel,
} from "amqplib";

export const INVENTORY_EXCHANGE = "northstar.inventory";
export const INVENTORY_QUEUE = "inventory.worker";
export const INVENTORY_ROUTING_KEY = "inventory.changed";

let connection: ChannelModel | null = null;
let channel: ConfirmChannel | null = null;

async function connectRabbitMQ(): Promise<ConfirmChannel> {
  const rabbitmqUrl = process.env.RABBITMQ_URL;

  if (!rabbitmqUrl) {
    throw new Error(
      "RABBITMQ_URL is not configured in .env.local"
    );
  }

  console.log("Connecting to RabbitMQ...");

  const newConnection = await amqp.connect(rabbitmqUrl);

  console.log("Connected to RabbitMQ");

  const newChannel =
    await newConnection.createConfirmChannel();

  await newChannel.assertExchange(
    INVENTORY_EXCHANGE,
    "topic",
    {
      durable: true,
    }
  );

  await newChannel.assertQueue(
    INVENTORY_QUEUE,
    {
      durable: true,
    }
  );

  await newChannel.bindQueue(
    INVENTORY_QUEUE,
    INVENTORY_EXCHANGE,
    INVENTORY_ROUTING_KEY
  );

  // Handle connection errors instead of allowing
  // ECONNRESET to become an uncaught exception.
  newConnection.on("error", (error) => {
    console.error(
      "RabbitMQ connection error:",
      error.message
    );
  });

  newConnection.on("close", () => {
    console.error(
      "RabbitMQ connection closed."
    );

    connection = null;
    channel = null;
  });

  // Handle channel errors.
  newChannel.on("error", (error) => {
    console.error(
      "RabbitMQ channel error:",
      error.message
    );
  });

  console.log(
    `RabbitMQ ready: ${INVENTORY_EXCHANGE} → ${INVENTORY_QUEUE}`
  );

  connection = newConnection;
  channel = newChannel;

  return newChannel;
}

export async function getRabbitChannel(): Promise<ConfirmChannel> {
  if (channel) {
    return channel;
  }

  return connectRabbitMQ();
}

export async function publishInventoryEvent(
  event: unknown
): Promise<void> {
  const rabbitChannel = await getRabbitChannel();

  const message = Buffer.from(
    JSON.stringify(event)
  );

  rabbitChannel.publish(
    INVENTORY_EXCHANGE,
    INVENTORY_ROUTING_KEY,
    message,
    {
      persistent: true,
      contentType: "application/json",
      mandatory: true,
    }
  );

  await rabbitChannel.waitForConfirms();

  console.log(
    `RabbitMQ confirmed inventory event: ${INVENTORY_ROUTING_KEY}`
  );
}