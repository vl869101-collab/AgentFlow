import fs from " node:fs\;

const pagePath = \apps/web/src/app/credentials/page.tsx\;
const current = fs.readFileSync(pagePath, \utf8\);

// Replace step 2 with generalized bucket modal and 760px size
const newStep2 = \ {/* Generalized 760px Credential Modal */}
 <Modal open={open} onClose={() => setOpen(false)} title=\\ className={\\\\ !bg-[#1e1e20] !border-white/[0.08] !rounded-2xl !p-0 !overflow-visible !shadow-[0_32px_64px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.06)]\}>\;

console.log(\Replacing...\);