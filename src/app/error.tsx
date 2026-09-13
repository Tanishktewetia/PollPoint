"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-lg px-6 py-24"><p className="eyebrow text-brand">Let’s try that again</p><h1 className="mt-4 text-3xl font-bold">We couldn’t load this page.</h1><p className="mt-4 leading-7 text-muted">Your request could not be completed. Please try again in a moment.</p><button className="primary-button mt-7" onClick={reset}>Try again</button></main>;
}
