"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return <AuthShell title={sent ? "Check your inbox" : "Reset your password"} description={sent ? `We sent a recovery link to ${email}. It will be valid for the next 30 minutes.` : "Enter the email tied to your workspace and we’ll send a secure recovery link."} footer={<>Remembered your password? <Link href="/login" className="font-medium text-violet-300 hover:text-violet-200">Back to sign in</Link></>}>
    {sent ? <div className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10 text-green-400"><MailCheck className="h-7 w-7" /></div><p className="mt-5 text-sm leading-6 text-zinc-400">Open the email from AgentFlow and follow the link to choose a new password.</p><Button variant="secondary" className="mt-6 w-full" onClick={() => setSent(false)}><ArrowLeft className="h-4 w-4" /> Try another email</Button></div> : <form onSubmit={(event) => { event.preventDefault(); setSent(true); }} className="space-y-5"><Input label="Work email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /><Button type="submit" className="w-full">Send recovery link <ArrowRight className="h-4 w-4" /></Button></form>}
  </AuthShell>;
}
