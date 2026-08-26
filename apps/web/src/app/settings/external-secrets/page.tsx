"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { GatedFeatureBanner } from "@/components/GatedFeatureBanner";
export default function ExternalSecretsPage(){ return <AppLayout><div className="max-w-3xl"><h1 className="text-2xl font-semibold text-zinc-50">External Secrets</h1><div className="mt-8"><GatedFeatureBanner description="Connect Vault, AWS Secrets Manager, or Azure Key Vault to securely manage credential parameters." learnMoreUrl="https://docs.n8n.io/administer/use-source-control-and-environments" /></div></div></AppLayout>; }
