"use client";

import { useState } from "react";
import { ArrowUp, Bot, Calendar, FileText, Mic, Paperclip, Sparkles, Target } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";

const chips = [
  { icon: Target, label: "Score my leads" },
  { icon: FileText, label: "Process invoices" },
  { icon: Calendar, label: "Schedule social posts" },
  { icon: Bot, label: "Telegram support agent" },
];

export default function AssistantPage() {
  const [value, setValue] = useState("");

  return (
    <AppLayout>
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16">
        <h1 className="inline-flex items-center gap-2 text-xl font-medium text-zinc-100">
          <Sparkles className="h-5 w-5 text-zinc-400" /> What do you want to automate?
        </h1>

        <div className="mt-8 w-full max-w-3xl rounded-xl border border-white/10 bg-zinc-900 p-4 shadow-sm">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Tell me what to build or ask me a question"
            rows={3}
            className="w-full resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" className="rounded-md p-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-300" aria-label="Attach file">
              <Paperclip className="h-4 w-4" />
            </button>
            <button type="button" className="rounded-md p-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-300" aria-label="Voice input">
              <Mic className="h-4 w-4" />
            </button>
            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-violet-500 text-white hover:bg-violet-600" aria-label="Send">
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {chips.map((chip) => {
            const Icon = chip.icon;
            return (
              <button key={chip.label} type="button" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10">
                <Icon className="h-3.5 w-3.5 text-zinc-500" />
                {chip.label}
              </button>
            );
          })}
          <button type="button" className="text-xs text-zinc-500 hover:text-zinc-300">See all →</button>
        </div>
      </div>
    </AppLayout>
  );
}
