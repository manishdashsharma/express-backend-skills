import {
  asyncHandler,
  httpResponse,
  httpError,
  responseMessage,
  logger,
} from '../../../shared/index.js';
import { runAssistantTurnService } from '../services/assistant.service.js';
import { summarizeTextService } from '../services/summarize.service.js';
import { describeAiFailure } from '../services/errors.service.js';

const openEventStream = (res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

const chat = async (req, res) => {
  const send = openEventStream(res);
  const ctx = { user: req.user, requestId: req.requestId };
  try {
    for await (const event of runAssistantTurnService(ctx, req.body)) {
      send(event.type, event.data);
    }
  } catch (error) {
    logger.error('Assistant chat failed', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      requestId: req.requestId,
    });
    send('error', describeAiFailure(error));
  } finally {
    res.end();
  }
};

const summarize = asyncHandler(async (req, res) => {
  try {
    const summary = await summarizeTextService(req.body);
    logger.info('Text summarized', { userId: req.user.id, requestId: req.requestId });
    return httpResponse(req, res, 200, responseMessage.custom('Summary ready'), { summary });
  } catch (error) {
    logger.error('Summarize failed', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      requestId: req.requestId,
    });
    const friendly = Object.assign(new Error(describeAiFailure(error).message), {
      statusCode: error.statusCode || 500,
    });
    return httpError(req, res, friendly, friendly.statusCode);
  }
});

export { chat, summarize };
