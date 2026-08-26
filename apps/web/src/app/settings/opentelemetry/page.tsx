'use client';
import { AppLayout } from '@/components/layout/AppLayout';
import { GatedFeatureBanner } from '@/components/GatedFeatureBanner';
export default function OpenTelemetryPage(){ return <AppLayout><div className='max-w-3xl'><h1 className='text-2xl font-semibold text-zinc-50'>OpenTelemetry</h1><div className='mt-8'><GatedFeatureBanner description='Export traces and metrics to your OTel collector for observability.' learnMoreUrl='https://docs.n8n.io/administer/use-source-control-and-environments' /></div></div></AppLayout>; }
