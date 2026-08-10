"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface AuthResult {
  success: boolean;
  error?: string;
  /** Set when the user must confirm an emailed link before they are signed in. */
  emailSent?: boolean;
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

const magicLinkSchema = z.object({
  email: z.email({ message: "Enter a valid email" }).transform((value) => value.toLowerCase()),
});

/** Absolute origin for redirect URLs. Supabase rejects relative ones. */
async function getOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

function callbackUrl(origin: string, redirectTo: string): string {
  // Only same-site paths, so a crafted `next` cannot bounce users off-site.
  const safe = redirectTo.startsWith("/") ? redirectTo : "/";
  return `${origin}/auth/callback?next=${encodeURIComponent(safe)}`;
}

export async function signUp(name: string, email: string, password: string): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse({ name, email, password });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
      emailRedirectTo: callbackUrl(await getOrigin(), "/"),
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // With email confirmation on, Supabase returns a user but no session.
  if (!data.session) {
    return { success: true, emailSent: true };
  }

  return { success: true };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const parsed = signInSchema.safeParse({ email, password });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Generic message so the form does not reveal which emails have accounts.
    return { success: false, error: "Invalid email or password" };
  }

  return { success: true };
}

/** Sends a passwordless sign-in link. Also creates the account if it is new. */
export async function signInWithMagicLink(
  email: string,
  redirectTo: string = "/",
): Promise<AuthResult> {
  const parsed = magicLinkSchema.safeParse({ email });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: callbackUrl(await getOrigin(), redirectTo) },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, emailSent: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function getSessionUser() {
  return getCurrentUser();
}
