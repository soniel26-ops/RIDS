/**
 * Filas BullMQ. Tudo que é repetível, em massa ou depende de serviço externo
 * (sincronizar catálogo, enviar pedido ao fornecedor, reprocessar webhook) entra aqui.
 * Jobs são idempotentes: usar jobId determinístico (ex.: `${storeId}:${webhookId}`)
 * para que a mesma tarefa nunca seja enfileirada duas vezes.
 */
import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";

export const QUEUES = {
  shopifySync: "shopify-sync",
  webhookProcess: "webhook-process",
} as const;

let connection: IORedis | undefined;

export function getRedisConnection(): IORedis {
  if (connection) return connection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL não definida.");
  connection = new IORedis(url, { maxRetriesPerRequest: null });
  return connection;
}

const queues = new Map<string, Queue>();

export function getQueue(name: (typeof QUEUES)[keyof typeof QUEUES]): Queue {
  const existing = queues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, {
    connection: getRedisConnection() as unknown as ConnectionOptions,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    },
  });
  queues.set(name, queue);
  return queue;
}
