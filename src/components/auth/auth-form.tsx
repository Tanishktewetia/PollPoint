"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, CircleCheck, LoaderCircle } from "lucide-react";
import { login, signup } from "@/app/actions/auth";

export function AuthForm({ mode, next, confirmationError }: { mode: "login" | "signup"; next?: string; confirmationError?: boolean }) {
  const isSignup = mode === "signup";
  const [state, action, pending] = useActionState(isSignup ? signup : login, {});

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      {confirmationError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">This confirmation link is invalid or has expired. Try signing in if you already confirmed your email, or request a fresh link by signing up again.</p>}
      {state.success ? <div role="status" className="rounded-2xl border border-brand/20 bg-brand/5 p-5"><CircleCheck className="mb-3 text-brand" aria-hidden="true" /><h2 className="mb-2 text-lg font-bold">One more step</h2><p className="text-sm leading-6 text-muted">{state.success}</p></div> : <>
        <div><label htmlFor="email" className="text-sm font-semibold">Email address</label><input className="input-field" id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required disabled={pending} /></div>
        <div><label htmlFor="password" className="text-sm font-semibold">Password</label><input className="input-field" id="password" name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} placeholder={isSignup ? "Create a strong password" : "Enter your password"} minLength={isSignup ? 10 : 1} maxLength={128} aria-describedby={isSignup ? "password-hint" : undefined} required disabled={pending} />{isSignup && <p id="password-hint" className="mt-2 text-xs text-muted">Use at least 10 characters.</p>}</div>
        {isSignup && <div><label htmlFor="confirmPassword" className="text-sm font-semibold">Confirm password</label><input className="input-field" id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" placeholder="Enter your password again" maxLength={128} required disabled={pending} /></div>}
        {state.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{state.error}</p>}
        <button className="primary-button w-full" type="submit" disabled={pending}>{pending ? <><LoaderCircle size={18} className="animate-spin" aria-hidden="true" />Please wait…</> : <>{isSignup ? "Create account" : "Sign in"}<ArrowRight size={18} aria-hidden="true" /></>}</button>
      </>}
      <p className="text-center text-sm text-muted">{isSignup ? "Already have an account?" : "New to PollPoint?"} <Link className="font-bold text-brand underline-offset-4 hover:underline" href={isSignup ? "/login" : "/signup"}>{isSignup ? "Sign in" : "Create an account"}</Link></p>
    </form>
  );
}
