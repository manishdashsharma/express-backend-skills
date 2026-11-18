import express from 'express';
import { authenticate, validateRequest, authLimiter } from '../../../shared/index.js';
import {
  signUp,
  signIn,
  refreshSession,
  logout,
  logoutAll,
  getMe,
  listSessions,
} from '../controllers/auth.controller.js';
import { signUpSchema, signInSchema } from '../validations/auth.schema.js';

const router = express.Router();

router.post('/sign-up', authLimiter, validateRequest(signUpSchema, 'body'), signUp);
router.post('/sign-in', authLimiter, validateRequest(signInSchema, 'body'), signIn);
router.post('/refresh', authLimiter, refreshSession);
router.post('/logout', logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/me', authenticate, getMe);
router.get('/sessions', authenticate, listSessions);

export default router;
