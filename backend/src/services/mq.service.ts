import { Client } from "@upstash/qstash";
import { appLogger } from "./logger.js";

const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:4000";

if (!QSTASH_TOKEN) {
  appLogger.warn(
    "QSTASH_TOKEN is not set – message publishing will be disabled"
  );
}

const qstashClient = QSTASH_TOKEN ? new Client({ token: QSTASH_TOKEN }) : null;

const TOPIC_ROUTES: Record<string, string> = {
  "file-ingested": "/api/v1/internal/extract-text",
  "analysis-requested": "/api/v1/internal/analyze-ai",
};

export interface PublishResult {
  messageId: string;
}

export const publishEvent = async (
  topic: string,
  payload: Record<string, unknown>
): Promise<PublishResult> => {
  const route = TOPIC_ROUTES[topic];

  if (!route) {
    const knownTopics = Object.keys(TOPIC_ROUTES).join(", ");
    throw new Error(
      `[mq.service] Unknown topic "${topic}". Known topics: ${knownTopics}`
    );
  }

  if (!qstashClient) {
    throw new Error(
      "[mq.service] QStash client is not initialised (QSTASH_TOKEN missing)"
    );
  }

  const destination = `${BASE_URL}${route}`;

  appLogger.info("[mq.service] Publishing event", { topic, destination });

  const response = await qstashClient.publishJSON({
    url: destination,
    body: payload,
    retries: 3,
  });

  appLogger.info("[mq.service] Event published", {
    topic,
    messageId: response.messageId,
  });

  return { messageId: response.messageId };
};
