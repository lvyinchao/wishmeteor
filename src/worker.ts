import astroWorker from '../dist/_worker.js/index.js';
import { processCardGeneration, type CardGenerationEnv, type CardGenerationJob } from './lib/card-generation';

type QueueMessage = { body: unknown; ack: () => void };
type QueueBatch = { messages: QueueMessage[] };

export default {
  fetch: astroWorker.fetch,
  async queue(batch: QueueBatch, env: CardGenerationEnv) {
    for (const message of batch.messages) {
      await processCardGeneration(message.body as CardGenerationJob, env);
      message.ack();
    }
  },
};
