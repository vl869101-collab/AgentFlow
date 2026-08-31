import test from "node:test";
import assert from "node:assert/strict";

test("Design System UI Components & Tokens Contract", async (t) => {
  await t.test("exports all required UI primitives from index", async () => {
    const ui = await import("../src/components/ui/index.js");
    assert.ok(ui.Button, "Button should be exported");
    assert.ok(ui.Input, "Input should be exported");
    assert.ok(ui.Badge, "Badge should be exported");
    assert.ok(ui.Modal, "Modal should be exported");
    assert.ok(ui.Tabs, "Tabs should be exported");
    assert.ok(ui.Card, "Card should be exported");
    assert.ok(ui.Drawer, "Drawer should be exported");
    assert.ok(ui.Tooltip, "Tooltip should be exported");
    assert.ok(ui.Select, "Select should be exported");
    assert.ok(ui.LoadingSpinner, "LoadingSpinner should be exported");
    assert.ok(ui.EmptyState, "EmptyState should be exported");
    assert.ok(ui.Progress, "Progress should be exported");
  });
});
