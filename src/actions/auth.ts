"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password-hash";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth/session";

export interface AuthResult {
  success: boolean;
  error?: string;
}

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
  email: z.email({ message: "Enter a valid email" }).transform((value) => value.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signInSchema = z.object({
  email: z.email({ message: "Enter a valid email" }).transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Password is required"),
});

export async function signUp(name: string, email: string, password: string): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse({ name, email, password });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
    columns: { id: true },
  });

  if (existing) {
    return { success: false, error: "An account with this email already exists" };
  }

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash: hashPassword(parsed.data.password),
    createdAt: new Date(),
  });

  await createSession(id);
  return { success: true };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const parsed = signInSchema.safeParse({ email, password });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
  });

  // Generic message so the form does not reveal which emails have accounts
  const genericError = "Invalid email or password";

  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return { success: false, error: genericError };
  }

  await createSession(user.id);
  return { success: true };
}

export async function signOut(): Promise<void> {
  await destroySession();
}

export async function getSessionUser() {
  return getCurrentUser();
}
