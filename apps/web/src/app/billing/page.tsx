"use client";

import { useState, useEffect } from "react";
import { CreditCard, Check, Zap, ArrowUpRight, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { billing, type Subscription } from "@/lib/api";

const plans = [
  {
    name: "Starter",
    price: "$0",
    period: "forever",
    priceId: "",
    features: ["100 executions/month", "1 workflow", "Webhook, HTTP and email integrations", "Workflow templates", "Community support"],
    current: false,
  },
  {
    name: "Basic",
    price: "$9",
    period: "/mo",
    priceId: "price_basic_monthly",
    features: ["500 executions/month", "3 workflows", "Core integrations", "Workflow templates", "Email support"],
    current: false,
  },
  {
    name: "Growth",
    price: "$19",
    period: "/mo",
    priceId: "price_growth_monthly",
    features: ["2,000 executions/month", "10 workflows", "Advanced integrations", "Execution history", "Priority support"],
    current: false,
  },
  {
    name: "Pro",
    price: "$39",
    period: "/mo",
    priceId: "price_pro_monthly",
    features: ["Unlimited executions/month", "Unlimited workflows", "All integrations", "AI agents + approvals", "Execution replay", "Advanced analytics", "Priority support"],
    current: false,
  },
];

export default function BillingPage() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    billing.getSubscription().then((s) => { setSub(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const currentPlan = sub?.plan || "free";
  plans.forEach((p) => { p.current = p.name.toLowerCase() === currentPlan || (currentPlan === "free" && p.name === "Starter"); });

  async function handleCheckout(priceId: string) {
    if (!priceId) return;
    setCheckoutLoading(priceId);
    try {
      const { url } = await billing.createCheckout(priceId);
      if (url && !url.startsWith("#")) {
        window.location.href = url;
      } else {
        alert("Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing.");
      }
    } catch (e: any) {
      alert(e.message || "Checkout failed");
    } finally {
      setCheckoutLoading(null);
    }
  }

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-zinc-50">Billing</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage your plan and billing details</p>
        </div>

        {sub && sub.status !== "free" && (
          <Card className="mb-6 bg-n8n-panel border border-n8n-accent/30 rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Current plan</p>
                <p className="text-lg font-semibold text-n8n-accent capitalize">{sub.plan}</p>
                <p className="text-xs text-zinc-600">Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}</p>
              </div>
              <Badge status={sub.status === "active" ? "success" : "warning"}>{sub.status}</Badge>
            </div>
          </Card>
        )}

        <div className="grid gap-6 sm:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.name} className={`relative bg-n8n-panel border border-white/10 rounded-lg p-5 ${plan.current ? "ring-2 ring-n8n-accent/50" : ""}`}>
              {plan.current && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-n8n-accent px-3 py-1 text-xs font-semibold text-white">Current</span>
                </div>
              )}
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-zinc-100">{plan.name}</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-zinc-50">{plan.price}</span>
                  <span className="text-sm text-zinc-500">{plan.period}</span>
                </div>
              </div>
              <ul className="space-y-3 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-zinc-400">
                    <Check className="h-4 w-4 text-green-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleCheckout(plan.priceId)}
                disabled={plan.current || !plan.priceId || checkoutLoading === plan.priceId}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  plan.current
                    ? "bg-white/5 text-zinc-600 cursor-not-allowed"
                    : "bg-n8n-accent hover:bg-n8n-accent-dark text-white"
                }`}
              >
                {checkoutLoading === plan.priceId ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : plan.current ? (
                  "Current plan"
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Zap className="h-4 w-4" />
                    Upgrade
                  </span>
                )}
              </button>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
