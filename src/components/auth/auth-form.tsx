"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signInWithMagicLink, signUp } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

interface AuthFormProps {
  mode: "signin" | "signup";
  redirectTo: string;
}

export function AuthForm({ mode, redirectTo }: AuthFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const isSignUp = mode === "signup";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const trimmedEmail = email.trim();

    const result = useMagicLink
      ? await signInWithMagicLink(trimmedEmail, redirectTo)
      : isSignUp
        ? await signUp(name.trim(), trimmedEmail, password)
        : await signIn(trimmedEmail, password);

    if (!result.success) {
      setError(result.error ?? "Something went wrong");
      setIsSubmitting(false);
      return;
    }

    // Magic link and unconfirmed signups have no session yet — the user has to
    // click the emailed link before there is anything to redirect to.
    if (result.emailSent) {
      setSentTo(trimmedEmail);
      setIsSubmitting(false);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  };

  if (sentTo) {
    return (
      <div className="space-y-4 text-center" data-testid="auth-email-sent">
        <p className="text-sm">
          Check <span className="font-medium">{sentTo}</span> for a sign-in link.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => {
            setSentTo(null);
            setError(null);
          }}
        >
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="auth-form">
      {isSignUp && !useMagicLink && (
        <div className="space-y-2">
          <label htmlFor="name" className="text-label">
            Name
          </label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            disabled={isSubmitting}
          />
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="email" className="text-label">
          Email
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          disabled={isSubmitting}
        />
      </div>

      {!useMagicLink && (
        <div className="space-y-2">
          <label htmlFor="password" className="text-label">
            Password
          </label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isSignUp ? "At least 8 characters" : "Your password"}
            disabled={isSubmitting}
          />
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert" data-testid="auth-error">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting
          ? "Please wait..."
          : useMagicLink
            ? "Email me a sign-in link"
            : isSignUp
              ? "Create Account"
              : "Sign In"}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full"
        disabled={isSubmitting}
        onClick={() => {
          setUseMagicLink((value) => !value);
          setError(null);
        }}
        data-testid="auth-toggle-magic-link"
      >
        {useMagicLink ? "Use a password instead" : "Email me a sign-in link instead"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="underline hover:text-foreground">
              Sign in
            </Link>
          </>
        ) : (
          <>
            No account yet?{" "}
            <Link href="/signup" className="underline hover:text-foreground">
              Sign up
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
