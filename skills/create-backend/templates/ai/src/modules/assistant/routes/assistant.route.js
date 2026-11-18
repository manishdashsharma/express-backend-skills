import express from 'express';
import { authenticate, validateRequest, aiLimiter } from '../../../shared/index.js';
import { chat, summarize } from '../controllers/assistant.controller.js';
import { chatSchema, summarizeSchema } from '../validations/assistant.schema.js';

const router = express.Router();

router.use(authenticate);

router.post('/chat', aiLimiter, validateRequest(chatSchema, 'body'), chat);
router.post('/summarize', aiLimiter, validateRequest(summarizeSchema, 'body'), summarize);

export default router;
