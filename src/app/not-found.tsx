import Link from "next/link";

export default function NotFound() {
  return <main className="mx-auto max-w-lg px-6 py-24"><p className="eyebrow text-brand">404 · Page not found</p><h1 className="mt-4 text-3xl font-bold">This page isn’t here.</h1><p className="mt-4 text-muted">Head back to your PollPoint space.</p><Link className="primary-button mt-7" href="/dashboard">Go to dashboard</Link></main>;
}
