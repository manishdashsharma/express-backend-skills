import { z } from 'zod';

const historyMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});

export const chatSchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(4000),
  history: z.array(historyMessage).max(20).default([]),
});

export const summarizeSchema = z.object({
  text: z.string().trim().min(1, 'Text is required').max(20000),
});

export const summaryResultSchema = z.object({
  title: z.string().max(120),
  summary: z.string().max(2000),
  keyPoints: z.array(z.string().max(300)).max(10),
});
