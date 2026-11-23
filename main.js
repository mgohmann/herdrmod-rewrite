// main.js: Entry point for the Rewrite Herdr mod.
import { View } from "gpui-kit";
import { TextareaState } from "gpui-base";
import { props, nextCommand, layout, run, notify, closeOverlay, appHome } from "herdr";
import { loadSettings } from "./settings.js";
import { panelCommands } from "./panel.js";
import { buildPrompt } from "./prompts.js";
import { runRewritePrompt } from "./ai.js";
import { copyFormatted } from "./clipboard.js";
import {
  createHistoryEntry,
  addHistoryEntry,
  removeHistoryEntry,
  loadHistory,
  saveHistory,
} from "./history.js";
import { panelMethods } from "./views/panel.js";

export const DEFAULT_SETTINGS = {
  panel: { toggle: false },
  history: { max_items: 20 },
  ai: {
    harness: "auto",
    effort: "low",
    timeout: "90s",
    max_input_chars: 24000,
    claude_model: "haiku",
    antigravity_model: "gemini-4-hydrogen",
    copilot_model: "gpt-6-luna",
    codex_model: "gpt-6-luna",
    opencode_model: "openrouter/openai/gpt-6-luna",
  },
  rewrite_types: {},
};

const BUILTIN_REWRITE_TYPES = [
  { id: "default", label: "Default", summary: "Grammar, spelling & clarity" },
  { id: "professionalize", label: "Professionalize", summary: "Polished email/Teams/doc tone" },
  { id: "answer-questions", label: "Answer Questions", summary: "Pair dictated answers to questions" },
];

const BUILTIN_OUTPUT_TYPES = [
  { id: "markdown", label: "Markdown", summary: "Standard Markdown" },
  { id: "plain-text", label: "Plain Text", summary: "Clean text, no Markdown" },
  { id: "obsidian-checklist", label: "Obsidian Checklist", summary: "Markdown tasks (- [ ])" },
  { id: "outlook-plain", label: "Outlook Plain Text", summary: "Email-ready plain text" },
  { id: "outlook-rich", label: "Outlook Rich Text", summary: "Copies rich HTML for Outlook" },
];

const HARNESS_OPTIONS = [
  { id: "auto", label: "Auto", detail: "Active tab agent, else first installed" },
  { id: "claude", label: "Claude", detail: "Claude Code (haiku)" },
  { id: "antigravity", label: "Antigravity", detail: "agy (gemini-4-hydrogen)" },
  { id: "copilot", label: "Copilot", detail: "Copilot CLI (gpt-6-luna)" },
  { id: "codex", label: "Codex", detail: "Codex CLI (gpt-6-luna)" },
  { id: "opencode", label: "OpenCode", detail: "OpenCode (gpt-6-luna)" },
];

class RewriteView extends View {
  init(given, cx) {
    const p = props() ?? given ?? {};
    if (p.overlay) {
      this.mode = "panel-key";
      this.runPanelKey(p.overlay, cx);
      return;
    }

    this.mode = p.mode ?? "sidebar";
    this.settings = DEFAULT_SETTINGS;
    this.busy = false;
    this.error = null;
    this.note = null;
    this.copiedAt = 0;
    this.copiedHistoryId = null;
    this.history = [];
    this.expandedHistoryId = null;
    this.confirmClearHistory = false;

    this.rewriteType = localStorage.getItem("rewrite-type") ?? "default";
    this.outputType = localStorage.getItem("output-type") ?? "markdown";
    this.harness = localStorage.getItem("harness") ?? "auto";
    this.autoCopy = localStorage.getItem("auto-copy") === "true";
    this.contextOpen = localStorage.getItem("context-open") === "true";

    this.harnessMenuOpen = false;
    this.harnessMenuFocus = cx.focus_handle();
    this.rewriteMenuOpen = false;
    this.rewriteMenuFocus = cx.focus_handle();
    this.outputMenuOpen = false;
    this.outputMenuFocus = cx.focus_handle();

    this.initInputs(cx);
    this.applySettings(cx);
    cx.spawn(async (cx) => {
      for (;;) this.command(await nextCommand(), cx);
    });
  }

  initInputs(cx) {
    this.contextText = "";
    this.contextFocused = false;
    this.contextInput = TextareaState.new({
      placeholder: "Optional context (e.g. questions list, email thread)...",
      rows: 3,
    });
    this.contextInput.on("change", (_e, cx) => {
      this.contextText = this.contextInput.value();
      cx.notify();
    });
    this.contextInput.on("focus", (_e, cx) => {
      this.contextFocused = true;
      cx.notify();
    });
    this.contextInput.on("blur", (_e, cx) => {
      this.contextFocused = false;
      cx.notify();
    });

    this.inputText = "";
    this.inputFocused = false;
    this.input = TextareaState.new({
      placeholder: "Paste or dictate text to rewrite...",
      rows: 5,
    });
    this.input.on("change", (_e, cx) => {
      this.inputText = this.input.value();
      cx.notify();
    });
    this.input.on("focus", (_e, cx) => {
      this.inputFocused = true;
      cx.notify();
    });
    this.input.on("blur", (_e, cx) => {
      this.inputFocused = false;
      cx.notify();
    });

    this.outputText = "";
    this.outputFocused = false;
    this.outputInput = TextareaState.new({
      placeholder: "Rewritten output will appear here (editable)...",
      rows: 6,
    });
    this.outputInput.on("change", (_e, cx) => {
      this.outputText = this.outputInput.value();
      cx.notify();
    });
    this.outputInput.on("focus", (_e, cx) => {
      this.outputFocused = true;
      cx.notify();
    });
    this.outputInput.on("blur", (_e, cx) => {
      this.outputFocused = false;
      cx.notify();
    });
  }

  runPanelKey(overlay, cx) {
    cx.spawn(async () => {
      try {
        const { settings } = await loadSettings("rewrite", DEFAULT_SETTINGS);
        const commands = panelCommands(layout(), "rewrite", settings.panel.toggle);
        if (commands) for (const [name, args] of commands) run(name, args);
        else notify({ title: "Rewrite isn't in this layout" });
      } finally {
        closeOverlay(overlay);
      }
    });
  }

  applySettings(cx) {
    cx.spawn(async (cx) => {
      const { settings, problems } = await loadSettings("rewrite", DEFAULT_SETTINGS);
      for (const problem of problems) console.warn(`rewrite mod.json settings: ${problem}`);
      this.settings = settings;
      if (!localStorage.getItem("harness") && settings.ai?.harness) {
        this.harness = settings.ai.harness;
      }
      const maxItems = settings.history?.max_items ?? 20;
      this.history = await loadHistory(`${appHome()}/data/rewrite`, maxItems);
      cx.notify();
    });
  }

  command(cmd, cx) {
    if (cmd === "rewrite") this.runRewrite(cx);
    if (cmd === "clear") this.clearEditor(cx);
    if (cmd === "copy") this.copyOutput(cx);
  }

  availableRewriteTypes() {
    const custom = Object.entries(this.settings?.rewrite_types ?? {}).map(([id, def]) => ({
      id,
      label: def.label,
      summary: "Custom prompt",
    }));
    const merged = [...BUILTIN_REWRITE_TYPES];
    for (const item of custom) {
      const idx = merged.findIndex((m) => m.id === item.id);
      if (idx >= 0) merged[idx] = { ...merged[idx], ...item };
      else merged.push(item);
    }
    return merged;
  }

  availableOutputTypes() {
    return BUILTIN_OUTPUT_TYPES;
  }

  harnessOptions() {
    return HARNESS_OPTIONS;
  }

  harnessLabel(id) {
    return HARNESS_OPTIONS.find((h) => h.id === id)?.label ?? "Auto";
  }

  setRewriteType(id, cx) {
    this.rewriteType = id;
    localStorage.setItem("rewrite-type", id);
    cx.notify();
  }

  setOutputType(id, cx) {
    this.outputType = id;
    localStorage.setItem("output-type", id);
    cx.notify();
  }

  setHarness(id, cx) {
    this.harness = id;
    localStorage.setItem("harness", id);
    cx.notify();
  }

  toggleAutoCopy(cx) {
    this.autoCopy = !this.autoCopy;
    localStorage.setItem("auto-copy", String(this.autoCopy));
    cx.notify();
  }

  toggleContext(cx) {
    this.contextOpen = !this.contextOpen;
    localStorage.setItem("context-open", String(this.contextOpen));
    cx.notify();
  }

  hasAnyText() {
    return Boolean(this.contextText.trim() || this.inputText.trim() || this.outputText.trim());
  }

  clearContext(cx) {
    this.contextText = "";
    this.contextInput.set_value("");
    cx.notify();
  }

  clearEditor(cx) {
    this.contextText = "";
    this.contextInput.set_value("");
    this.inputText = "";
    this.input.set_value("");
    this.outputText = "";
    this.outputInput.set_value("");
    this.error = null;
    this.note = null;
    cx.notify();
  }

  copyOutput(cx, text = this.outputText, outputType = this.outputType) {
    if (!String(text ?? "").trim()) return;
    const token = Date.now();
    this.copiedAt = token;
    cx.notify();

    cx.spawn(async (cx) => {
      const res = await copyFormatted(text, outputType, cx);
      if (res.fallback) {
        this.note = "Rich copy unavailable; copied plain text instead.";
      }
      cx.notify();
      cx.timer.after(1500, (cx) => {
        if (this.copiedAt === token) {
          this.copiedAt = 0;
          cx.notify();
        }
      });
    });
  }

  reRewriteFromOutput(cx) {
    if (!this.outputText.trim() || this.busy) return;
    this.inputText = this.outputText;
    this.input.set_value(this.outputText);
    this.runRewrite(cx);
  }

  runRewrite(cx) {
    const raw = this.inputText.trim();
    if (!raw || this.busy) return;
    this.busy = true;
    this.error = null;
    this.note = null;
    cx.notify();

    const prompt = buildPrompt({
      rewriteType: this.rewriteType,
      outputType: this.outputType,
      context: this.contextText,
      input: raw,
      customRewriteTypes: this.settings?.rewrite_types,
    });
    const harnessSetting = this.harness || this.settings?.ai?.harness || "auto";
    const aiSettings = this.settings?.ai ?? DEFAULT_SETTINGS.ai;

    const snapshot = {
      rewriteType: this.rewriteType,
      outputType: this.outputType,
      context: this.contextText,
      input: raw,
    };

    cx.spawn(async (cx) => {
      try {
        const result = await runRewritePrompt({ prompt, harnessSetting, aiSettings });
        this.outputText = result.text;
        this.outputInput.set_value(result.text);
        this.note = `Rewritten with ${result.label} (${result.model})`;
        await this.recordHistory({
          ...snapshot,
          harness: result.harness,
          model: result.model,
          output: result.text,
        });
        if (this.autoCopy) this.copyOutput(cx);
      } catch (error) {
        this.error = `Rewrite failed: ${error.message}`;
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  async recordHistory(entryData) {
    const maxItems = this.settings?.history?.max_items ?? 20;
    const entry = createHistoryEntry(entryData);
    this.history = addHistoryEntry(this.history, entry, maxItems);
    try {
      await saveHistory(`${appHome()}/data/rewrite`, this.history);
    } catch (error) {
      console.warn(`Failed to save rewrite history: ${error.message}`);
    }
  }

  toggleHistoryItem(id, cx) {
    this.expandedHistoryId = this.expandedHistoryId === id ? null : id;
    cx.notify();
  }

  copyHistoryItem(item, cx) {
    if (!item?.output?.trim()) return;
    this.copiedHistoryId = item.id;
    cx.notify();
    cx.spawn(async (cx) => {
      await copyFormatted(item.output, item.outputType, cx);
      cx.timer.after(1500, (cx) => {
        if (this.copiedHistoryId === item.id) {
          this.copiedHistoryId = null;
          cx.notify();
        }
      });
    });
  }

  loadHistoryItem(item, cx) {
    if (!item) return;
    this.contextText = item.context ?? "";
    this.contextInput.set_value(this.contextText);
    if (this.contextText.trim()) {
      this.contextOpen = true;
      localStorage.setItem("context-open", "true");
    }
    this.inputText = item.input ?? "";
    this.input.set_value(this.inputText);
    this.outputText = item.output ?? "";
    this.outputInput.set_value(this.outputText);

    if (item.rewriteType) this.setRewriteType(item.rewriteType, cx);
    if (item.outputType) this.setOutputType(item.outputType, cx);
    this.error = null;
    this.note = "Loaded snapshot from history.";
    cx.notify();
  }

  reRewriteHistoryItem(item, cx) {
    if (!item || this.busy) return;
    this.loadHistoryItem(item, cx);
    this.runRewrite(cx);
  }

  deleteHistoryItem(id, cx) {
    this.history = removeHistoryEntry(this.history, id);
    if (this.expandedHistoryId === id) this.expandedHistoryId = null;
    cx.notify();
    cx.spawn(async () => {
      await saveHistory(`${appHome()}/data/rewrite`, this.history).catch((e) =>
        console.warn(`Failed to save rewrite history: ${e.message}`),
      );
    });
  }

  clearAllHistory(cx) {
    if (!this.history.length) return;
    if (!this.confirmClearHistory) {
      this.confirmClearHistory = true;
      cx.notify();
      cx.timer.after(3000, (cx) => {
        if (this.confirmClearHistory) {
          this.confirmClearHistory = false;
          cx.notify();
        }
      });
      return;
    }
    this.confirmClearHistory = false;
    this.history = [];
    this.expandedHistoryId = null;
    cx.notify();
    cx.spawn(async () => {
      await saveHistory(`${appHome()}/data/rewrite`, []).catch((e) =>
        console.warn(`Failed to clear rewrite history: ${e.message}`),
      );
    });
  }
}

Object.assign(RewriteView.prototype, panelMethods);

export default RewriteView;
