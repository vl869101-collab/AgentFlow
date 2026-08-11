import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: "AgentFlow — Intelligent workflows, made visual", template: "%s · AgentFlow" },
  description: "Build, run, and understand AI-powered workflows with AgentFlow.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body>{children}</body></html>;
}
