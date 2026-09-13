import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), "utf8");
}

test("AgentFlow UX design contracts", async (t) => {
  await t.test("keeps visual DNA centralized and consumed by workflow chrome", () => {
    const tokens = readSource("styles/tokens.css");
    const globals = readSource("styles/globals.css");
    const canvas = readSource("components/workflow/WorkflowCanvas.tsx");

    assert.match(tokens, /--color-background:\s*#09090b/);
    assert.match(tokens, /--color-accent:\s*#8b5cf6/);
    assert.match(tokens, /--glow-violet:/);
    assert.match(globals, /@import ["']\.\/tokens\.css["']/);
    assert.match(globals, /\.af-workflow-canvas/);
    assert.match(canvas, /className="af-workflow-canvas\b/);
    assert.match(canvas, /var\(--color-accent-cool\)/);
    assert.match(canvas, /className="af-workflow-hint\b/);
  });

  await t.test("keeps workflow condition outputs unambiguous and labeled", () => {
    const node = readSource("components/workflow/nodes/BaseNode.tsx");

    assert.doesNotMatch(node, /id="default"/);
    assert.match(node, /id="true"/);
    assert.match(node, /id="false"/);
    assert.match(node, /aria-label=\{`Entrada do nó/);
    assert.match(node, /aria-label=\{`Saída ramo verdadeiro/);
    assert.match(node, /aria-label=\{`Saída ramo falso/);
  });

  await t.test("gives dialogs and target marketplace controls accessible names", () => {
    const modal = readSource("components/ui/Modal.tsx");
    const preview = readSource("components/templates/TemplatePreviewModal.tsx");
    const templates = readSource("app/templates/page.tsx");

    assert.match(modal, /ariaLabel\?: string/);
    assert.match(modal, /aria-label=\{title \? undefined : ariaLabel \?\? "Modal"\}/);
    assert.match(preview, /ariaLabel=\{`Template preview: \$\{template\.name\}`\}/);
    assert.match(templates, /className="af-template-card/);
    assert.match(templates, /aria-label=\{`Visualizar detalhes do template \$\{tpl\.name\}`\}/);
  });

  await t.test("keeps credentials selection and tabs keyboard-addressable", () => {
    const credentials = readSource("app/credentials/page.tsx");

    assert.match(credentials, /role="combobox"/);
    assert.match(credentials, /aria-activedescendant=/);
    assert.match(credentials, /credential-provider-option-\$\{index\}/);
    assert.match(credentials, /function handleProviderKeyDown/);
    assert.match(credentials, /function handleTabKeyDown/);
    assert.match(credentials, /id=\{`credential-tab-\$\{t\.k\}`\}/);
    assert.match(credentials, /tabIndex=\{detailTab === t\.k \? 0 : -1\}/);
    assert.match(credentials, /aria-labelledby="credential-tab-connection"/);
    assert.match(credentials, /aria-labelledby="credential-tab-sharing"/);
    assert.match(credentials, /aria-labelledby="credential-tab-details"/);
    assert.match(credentials, /role=\{testResult\.success \? "status" : "alert"\}/);
  });
});
