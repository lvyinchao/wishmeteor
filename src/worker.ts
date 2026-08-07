import astroWorker from '../dist/_worker.js/index.js';
import { processCardGeneration, type CardGenerationEnv, type CardGenerationJob } from './lib/card-generation';

type QueueMessage = { body: unknown; ack: () => void };
type QueueBatch = { messages: QueueMessage[] };

export default {
  fetch(...args: Parameters<typeof astroWorker.fetch>) {
    const [request] = args;
    const url = new URL(request.url);
    if (url.hostname === 'www.wishmeteor.net') {
      url.hostname = 'wishmeteor.net';
      return Response.redirect(url.toString(), 301);
    }
    return astroWorker.fetch(...args);
  },
  async queue(batch: QueueBatch, env: CardGenerationEnv) {
    for (const message of batch.messages) {
      await processCardGeneration(message.body as CardGenerationJob, env);
      message.ack();
    }
  },
};
