import Link from "next/link";
import { ChartNoAxesColumnIncreasing } from "lucide-react";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="PollPoint home"
      className={`inline-flex items-center gap-2.5 text-xl font-extrabold tracking-tight ${light ? "text-white" : "text-ink"}`}
    >
      <span
        className={`flex size-9 items-center justify-center rounded-xl ${light ? "bg-lime text-brand" : "bg-brand text-lime"}`}
      >
        <ChartNoAxesColumnIncreasing
          size={23}
          strokeWidth={2.8}
          aria-hidden="true"
        />
      </span>
      PollPoint<span className="-ml-1 text-[#477123]">.</span>
    </Link>
  );
}
