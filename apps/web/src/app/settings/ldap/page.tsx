"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { GatedFeatureBanner } from "@/components/GatedFeatureBanner";
export default function LDAPPage(){ return <AppLayout><div className="max-w-3xl"><h1 className="text-2xl font-semibold text-zinc-50">LDAP</h1><p className="mt-1 text-sm text-zinc-400">Configure centralized directory authentication via LDAP for team sign-in.</p><div className="mt-8"><GatedFeatureBanner description="Use LDAP to consolidate authentication into your central directory." learnMoreUrl="https://docs.n8n.io/administer/use-source-control-and-environments" /></div></div></AppLayout>; }
