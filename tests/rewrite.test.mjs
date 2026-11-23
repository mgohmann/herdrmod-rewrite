import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildPrompt, buildBoundedPrompt, resolveRewriteType, resolveOutputType } from "../prompts.js";
import { harnessOrder, cleanOutput } from "../ai-core.js";
import { markdownToHtml, markdownToPlainText, buildCfHtml, utf8Length } from "../format.js";
import {
  clampMaxItems,
  createHistoryEntry,
  addHistoryEntry,
  removeHistoryEntry,
  previewText,
  formatRelativeTime,
  loadHistory,
  saveHistory,
} from "../history.js";
import { panelCommands } from "../panel.js";
import { duration, mergeSettings } from "../settings-core.js";

test("prompts: resolves built-in and custom rewrite types", () => {
  const def = resolveRewriteType("default");
  assert.equal(def.label, "Default");

  const ans = resolveRewriteType("answer-questions");
  assert.match(ans.prompt, /out of order/i);

  const custom = resolveRewriteType("concise", {
    concise: { label: "Concise", prompt: "Make it 2 sentences." },
  });
  assert.equal(custom.label, "Concise");
  assert.equal(custom.prompt, "Make it 2 sentences.");

  const prompt = buildPrompt({
    rewriteType: "professionalize",
    outputType: "outlook-rich",
    context: "Q1: Timeline?",
    input: "we ship friday",
  });
  assert.match(prompt, /Professionalize/);
  assert.match(prompt, /Outlook Rich Text/);
  assert.match(prompt, /Q1: Timeline\?/);
  assert.match(prompt, /we ship friday/);
});

test("prompts: buildBoundedPrompt trims context first and preserves input", () => {
  const longContext = "C".repeat(2000);
  const input = "Important user text to rewrite.";
  const res = buildBoundedPrompt({
    rewriteType: "default",
    outputType: "markdown",
    context: longContext,
    input,
    maxChars: 1200,
  });
  assert.equal(res.contextTruncated, true);
  assert.ok(res.prompt.length <= 1200);
  assert.match(res.prompt, /Important user text to rewrite\./);
  assert.match(res.prompt, /\[\.\.\.truncated\]/);

  assert.throws(
    () =>
      buildBoundedPrompt({
        rewriteType: "default",
        outputType: "markdown",
        context: "",
        input: "X".repeat(1500),
        maxChars: 1000,
      }),
    /exceeds/,
  );
});

test("prompts: resolves all 5 output types", () => {
  for (const id of ["markdown", "plain-text", "obsidian-checklist", "outlook-plain", "outlook-rich"]) {
    assert.equal(resolveOutputType(id).id, id);
  }
});

test("ai-core: harnessOrder prioritizes focused tab pane in auto mode", () => {
  const order = harnessOrder("auto", [
    { app: "copilot", focused: false },
    { app: "claude", focused: true },
  ]);
  assert.equal(order[0], "claude");
  assert.equal(order[1], "copilot");
  assert.deepEqual(harnessOrder("codex", [{ app: "claude", focused: true }]), ["codex"]);
});

test("ai-core: cleanOutput strips ANSI, OpenCode banner, and outer fences even with trailing newlines", () => {
  const raw = "\x1b[32m> plan · gpt-6-luna\x1b[0m\r\n```markdown\r\nHello **world**\r\n\r\n\r\nDone\r\n```\n\n";
  assert.equal(cleanOutput(raw), "Hello **world**\n\nDone");
});

test("format: markdownToHtml supports nested lists, merged quotes, and valid UTF-8 CF_HTML offsets", () => {
  const md = [
    "## Update — 🚀",
    "- **Status**: Green",
    "  - Sub-item one",
    "  - [ ] Sub-task",
    "- [x] Done with `v1` & [docs](https://herdr.dev)",
    "> Quote line 1",
    "> Quote line 2",
  ].join("\n");
  const html = markdownToHtml(md);
  assert.match(html, /<h2[^>]*>Update — 🚀<\/h2>/);
  assert.match(html, /<strong>Status<\/strong>/);
  assert.match(html, /<ul[^>]*><li[^>]*>Sub-item one<\/li><li[^>]*>☐ Sub-task<\/li><\/ul><\/li>/);
  assert.match(html, /☑ Done with <code[^>]*>v1<\/code> &amp; <a href="https:\/\/herdr\.dev"/);
  assert.match(html, /<blockquote[^>]*>Quote line 1<br>Quote line 2<\/blockquote>/);

  const unsafe = markdownToHtml("[click](javascript:alert(1))");
  assert.doesNotMatch(unsafe, /<a /);
  assert.match(unsafe, /click/);

  assert.equal(utf8Length("🚀"), 4);

  const cf = buildCfHtml(html);
  const bytes = Buffer.from(cf, "utf8");
  const startHtml = Number(/StartHTML:(\d{10})/.exec(cf)[1]);
  const endHtml = Number(/EndHTML:(\d{10})/.exec(cf)[1]);
  const startFrag = Number(/StartFragment:(\d{10})/.exec(cf)[1]);
  const endFrag = Number(/EndFragment:(\d{10})/.exec(cf)[1]);

  assert.equal(endHtml, bytes.length);
  assert.equal(bytes.subarray(startHtml, startHtml + 6).toString("utf8"), "<html>");
  assert.equal(bytes.subarray(startFrag, endFrag).toString("utf8"), html);

  assert.equal(
    markdownToPlainText("## Title\n> Quoted *italic* and _more_\n- [ ] Task\n---"),
    "Title\nQuoted italic and more\n- Task",
  );
});

test("history: clamps maxItems, validates loaded JSON, and persists to disk", async () => {
  assert.equal(clampMaxItems(0), 1);
  assert.equal(clampMaxItems(999), 100);

  const dir = await mkdtemp(join(tmpdir(), "rewrite-hist-"));
  try {
    let list = [];
    for (let i = 0; i < 25; i++) {
      const entry = createHistoryEntry({
        rewriteType: "default",
        outputType: "markdown",
        harness: "claude",
        model: "haiku",
        context: "x".repeat(25000),
        input: `in ${i}`,
        output: `out ${i}`,
      });
      assert.equal(entry.context.length, 20000);
      list = addHistoryEntry(list, entry, 20);
    }
    assert.equal(list.length, 20);
    assert.equal(list[0].input, "in 24");

    await saveHistory(dir, list);
    const loaded = await loadHistory(dir, 20);
    assert.equal(loaded.length, 20);
    assert.equal(loaded[0].output, "out 24");

    // Malformed entries are skipped on load.
    await writeFile(
      join(dir, "history.json"),
      JSON.stringify([null, { id: "bad" }, { id: "ok1", output: "valid" }, { id: "ok1", output: "dup" }]),
      "utf8",
    );
    const sanitized = await loadHistory(dir, 20);
    assert.equal(sanitized.length, 1);
    assert.equal(sanitized[0].id, "ok1");

    const trimmed = removeHistoryEntry(loaded, loaded[0].id);
    assert.equal(trimmed.length, 19);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  assert.equal(previewText("hello\n   world", 20), "hello world");
  assert.equal(formatRelativeTime(new Date(1000).toISOString(), 1000 + 125000), "2m ago");
});

test("panel: panelCommands opens, selects, and toggles panel", () => {
  const tree = {
    id: "root",
    type: "row",
    children: [
      { id: "main", type: "block", content: { tab: "active" } },
      {
        id: "panel",
        type: "column",
        hidden: true,
        children: [
          {
            id: "panel-body",
            type: "stack",
            active: "changes",
            children: [
              { id: "changes", type: "block", content: { mod: "better-changes" } },
              { id: "rewrite", type: "block", content: { mod: "rewrite" } },
            ],
          },
        ],
      },
    ],
  };

  assert.deepEqual(panelCommands(tree, "rewrite", false), [
    ["layout.show", { id: "panel" }],
    ["layout.select", { stack: "panel-body", child: "rewrite" }],
  ]);

  tree.children[1].hidden = false;
  tree.children[1].children[0].active = "rewrite";
  assert.deepEqual(panelCommands(tree, "rewrite", false), []);
  assert.deepEqual(panelCommands(tree, "rewrite", true), [["layout.hide", { id: "panel" }]]);
  assert.equal(panelCommands(tree, "missing", true), null);
});

test("settings-core: validates enums, clamps history.max_items, and blocks __proto__", () => {
  assert.equal(duration("90s", 1000), 90000);
  assert.equal(duration("bad", 5000), 5000);

  const problems = [];
  const parsed = JSON.parse(
    '{"ai":{"effort":"high","harness":"bogus-agent"},"history":{"max_items":500},"rewrite_types":{"short":{"label":"Short","prompt":"Be brief."},"broken":{"label":"","prompt":"x"}},"__proto__":{"polluted":true}}',
  );
  const merged = mergeSettings(
    { ai: { effort: "low", harness: "auto" }, history: { max_items: 20 }, rewrite_types: {} },
    parsed,
    problems,
  );
  assert.equal(merged.ai.effort, "high");
  assert.equal(merged.ai.harness, "auto");
  assert.equal(merged.history.max_items, 100);
  assert.equal(merged.rewrite_types.short.label, "Short");
  assert.equal(merged.rewrite_types.broken, undefined);
  assert.equal(({}).polluted, undefined);
  assert.equal(problems.length, 2);
});
