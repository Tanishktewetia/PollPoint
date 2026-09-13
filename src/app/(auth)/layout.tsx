import { Brand } from "@/components/layout/brand";
import { ArrowUpRight, Check, Sparkles } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative flex flex-col overflow-hidden bg-brand p-7 text-white sm:p-12 lg:p-16">
        <Brand light />
        <div className="relative z-10 my-auto max-w-lg py-12 lg:py-20">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/20 px-3.5 py-2 text-xs font-semibold text-lime"><Sparkles size={14} aria-hidden="true" /> A little perspective. A lot of possibility.</div>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl xl:text-6xl">Your opinions.<br /><span className="text-lime">A rewarding<br className="hidden lg:block" /> difference.</span></h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-white/75">Share what you think, discover surveys picked for you, and turn your perspective into points.</p>
          <div aria-hidden="true" className="mt-10 hidden max-w-sm -rotate-3 rounded-2xl border border-white/20 bg-white/10 p-5 shadow-lg lg:block">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">Good things start with your voice.</span><ArrowUpRight className="text-lime" size={20} /></div>
            <div className="mt-5 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-lime text-brand"><Check size={21} /></span><div><p className="text-sm font-bold">Share. Complete. Earn.</p><p className="mt-1 text-xs text-white/65">Your next perspective is worth something.</p></div></div>
          </div>
        </div>
        <p className="text-xs text-white/55">A space for every perspective.</p>
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-44 -right-40 size-[28rem] rounded-full border-[70px] border-lime/10" />
      </section>
      <section className="flex items-center justify-center px-6 py-12 sm:px-12 lg:py-20"><div className="w-full max-w-sm">{children}</div></section>
    </main>
  );
}
