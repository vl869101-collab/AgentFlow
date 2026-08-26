"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { GatedFeatureBanner } from "@/components/GatedFeatureBanner";
export default function EnvironmentsPage(){ return <AppLayout><div className="max-w-3xl"><h1 className="text-2xl font-semibold text-zinc-50">Environments</h1><div className="mt-8"><GatedFeatureBanner description="Use multiple instances for different environments (dev, prod, etc.), deploying between them via a Git repository." learnMoreUrl="https://docs.n8n.io/administer/use-source-control-and-environments" /></div></div></AppLayout>; }
