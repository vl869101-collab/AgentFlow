import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";

export default function LandingPage() {
  return <div className="min-h-screen bg-zinc-950"><Hero /><Features /><HowItWorks /><Pricing /><Footer /></div>;
}
