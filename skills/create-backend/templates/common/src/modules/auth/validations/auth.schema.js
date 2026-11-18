import { z } from 'zod';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email'));

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email,
  password: z.string().min(8, 'Use at least 8 characters').max(128),
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});
