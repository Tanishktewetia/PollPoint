import { z } from "zod";

const email = z.string().trim().max(254).pipe(z.email("Enter a valid email address."));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(128, "Password is too long."),
});

export const signupSchema = loginSchema.extend({
  password: z.string().min(10, "Use at least 10 characters.").max(128, "Use at most 128 characters."),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.", path: ["confirmPassword"],
});

export type AuthState = { error?: string; success?: string };
