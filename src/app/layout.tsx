import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PollPoint — Your perspective matters", template: "%s | PollPoint" },
  description: "Share your perspective, take surveys, and earn points with PollPoint.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="font-sans antialiased">{children}</body></html>;
}
