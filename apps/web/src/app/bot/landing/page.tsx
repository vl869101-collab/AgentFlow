import type { Metadata } from "next";
import { BotLandingNavbar } from "@/components/bot/landing/BotLandingNavbar";
import { HeroVirtualDisplay } from "@/components/bot/landing/HeroVirtualDisplay";
import { TechnicalArchitectureSection } from "@/components/bot/landing/TechnicalArchitectureSection";
import { AutonomyBentoGrid } from "@/components/bot/landing/AutonomyBentoGrid";
import { DynamicUseCasesSection } from "@/components/bot/landing/DynamicUseCasesSection";
import { ComparisonTableSection } from "@/components/bot/landing/ComparisonTableSection";
import { PricingAndFaqSection } from "@/components/bot/landing/PricingAndFaqSection";

export const metadata: Metadata = {
  title: "AgentFlow Bot — Autonomous Browser Operating System for AI Agents",
  description:
    "Automate any web task 24/7 with an autonomous browser agent you can watch, inspect, and take over in real time with sub-20ms WebRTC streaming.",
};

export default function BotLandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-violet-500/30 selection:text-white antialiased font-sans">
      {/* Top Fixed Navigation */}
      <BotLandingNavbar />

      {/* Main Content Sections */}
      <main>
        {/* 1. Hero with Interactive noVNC / WebRTC Virtual Display */}
        <HeroVirtualDisplay />

        {/* 2. Technical Architecture Pipeline (MCP + Xvfb + Playwright) */}
        <TechnicalArchitectureSection />

        {/* 3. Autonomy Bento Grid (Dual Sandboxes, Takeover, Self-Healing, Vault) */}
        <AutonomyBentoGrid />

        {/* 4. Dynamic Use Cases with Output Schemas & ROI Metrics */}
        <DynamicUseCasesSection />

        {/* 5. Direct Benchmark Comparison Matrix */}
        <ComparisonTableSection />

        {/* 6. Capacity Pricing, FAQ & Final High-Conversion CTA */}
        <PricingAndFaqSection />
      </main>
    </div>
  );
}
