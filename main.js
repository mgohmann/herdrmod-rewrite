// main.js: Entry point for the Rewrite Herdr mod.
import { platform } from "os";
import { View } from "gpui-kit";
import { TextareaState } from "gpui-base";
import { props, nextCommand, layout, run, notify, closeOverlay, appHome, readTextFile, writeTextFile } from "herdr";
import { loadSettings } from "./settings.js";
import { panelCommands } from "./panel.js";
import { REWRITE_TYPES, OUTPUT_TYPES, buildBoundedPrompt } from "./prompts.js";
import { HARNESSES, HARNESS_ORDER, runRewritePrompt } from "./ai.js";
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

const BUILTIN_OUTPUT_TYPES = Object.values(OUTPUT_TYPES).map(({ id, label, summary }) => ({
  id,
  label,
  summary,
}));

const STORAGE = {
  rewriteType: "rewrite.type",
  outputType: "rewrite.output",
  harness: "rewrite.harness",
  autoCopy: "rewrite.auto-copy",
  contextOpen: "rewrite.context-open",
};

const HISTORY_IO = { readText: readTextFile, writeText: writeTextFile };

class RewriteView extends View {
  init(given, cx) {
    const p = props() ?? given ?? {};
    if (p.overlay) {
      this.mode = "panel-key";
      this.runPanelKey(p.overlay, cx);
      return;
    }

    this.mode = p.mode ?? "sidebar";
    this.isMac = platform() === "darwin";
    this.settings = DEFAULT_SETTINGS;
    this.busy = false;
    this.inputRevision = 0;
    this.copySeq = 0;
    this.error = null;
    this.note = null;
    this.copiedAt = 0;
    this.copiedHistoryId = null;
    this.history = [];
    this.expandedHistoryId = null;
    this.confirmClearHistory = false;
    this.historyLoaded = Promise.resolve();

    this.rewriteType = localStorage.getItem(STORAGE.rewriteType) ?? "default";
    this.outputType = localStorage.getItem(STORAGE.outputType) ?? "markdown";
    this.harness = localStorage.getItem(STORAGE.harness) ?? "auto";
    this.autoCopy = localStorage.getItem(STORAGE.autoCopy) === "true";
    this.contextOpen = localStorage.getItem(STORAGE.contextOpen) === "true";

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

  createTextField(cx, { placeholder, rows, textKey, focusKey, bumpRevision = false }) {
    this[textKey] = "";
    this[focusKey] = false;
    const state = TextareaState.new({ placeholder, rows });
    state.on("change", (_e, cx) => {
      this[textKey] = state.value();
      if (bumpRevision) this.inputRevision++;
      cx.notify();
    });
    state.on("focus", (_e, cx) => {
      this[focusKey] = true;
      cx.notify();
    });
    state.on("blur", (_e, cx) => {
      this[focusKey] = false;
      cx.notify();
    });
    return state;
  }

  initInputs(cx) {
    this.contextInput = this.createTextField(cx, {
      placeholder: "Optional context (e.g. questions list, email thread)...",
      rows: 3,
      textKey: "contextText",
      focusKey: "contextFocused",
      bumpRevision: true,
    });
    this.input = this.createTextField(cx, {
      placeholder: "Paste or dictate text to rewrite...",
      rows: 5,
      textKey: "inputText",
      focusKey: "inputFocused",
      bumpRevision: true,
    });
    this.outputInput = this.createTextField(cx, {
      placeholder: "Rewritten output will appear here (editable)...",
      rows: 6,
      textKey: "outputText",
      focusKey: "outputFocused",
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
    let resolveLoaded;
    this.historyLoaded = new Promise((res) => {
      resolveLoaded = res;
    });
    cx.spawn(async (cx) => {
      try {
        const { settings, problems } = await loadSettings("rewrite", DEFAULT_SETTINGS);
        for (const problem of problems) console.warn(`rewrite mod.json settings: ${problem}`);
        this.settings = settings;

        if (localStorage.getItem(STORAGE.harness) === null && settings.ai?.harness) {
          this.harness = settings.ai.harness;
        }

        const maxItems = settings.history?.max_items ?? 20;
        const loaded = await loadHistory(`${appHome()}/data/rewrite`, maxItems, HISTORY_IO);
        if (loaded.length) {
          const existingIds = new Set(this.history.map((h) => h.id));
          const merged = [...this.history, ...loaded.filter((h) => !existingIds.has(h.id))];
          this.history = merged.slice(0, maxItems);
        }
        cx.notify();
      } finally {
        resolveLoaded();
      }
    });
  }

  command(cmd, cx) {
    if (cmd === "rewrite") this.runRewrite(cx);
    if (cmd === "clear") this.clearEditor(cx);
    if (cmd === "copy") this.copyOutput(cx);
  }

  availableRewriteTypes() {
    const merged = Object.values(REWRITE_TYPES).map(({ id, label, summary }) => ({
      id,
      label,
      summary,
    }));
    for (const [id, def] of Object.entries(this.settings?.rewrite_types ?? {})) {
      const item = { id, label: def.label, summary: "Custom prompt" };
      const idx = merged.findIndex((m) => m.id === id);
      if (idx >= 0) merged[idx] = item;
      else merged.push(item);
    }
    return merged;
  }

  availableOutputTypes() {
    return BUILTIN_OUTPUT_TYPES;
  }

  harnessOptions() {
    const ai = this.settings?.ai ?? DEFAULT_SETTINGS.ai;
    return [
      { id: "auto", label: "Auto", detail: "Active tab agent, else first installed" },
      ...HARNESS_ORDER.map((id) => {
        const h = HARNESSES[id];
        const model = ai[`${id}_model`];
        return {
          id,
          label: h.shortLabel,
          detail: model ? `${h.detail} (${model})` : h.detail,
        };
      }),
    ];
  }

  harnessLabel(id) {
    if (id === "auto") return "Auto";
    return HARNESSES[id]?.shortLabel ?? "Auto";
  }

  setRewriteType(id, cx) {
    this.rewriteType = id;
    localStorage.setItem(STORAGE.rewriteType, id);
    cx.notify();
  }

  setOutputType(id, cx) {
    this.outputType = id;
    localStorage.setItem(STORAGE.outputType, id);
    cx.notify();
  }

  setHarness(id, cx) {
    this.harness = id;
    localStorage.setItem(STORAGE.harness, id);
    cx.notify();
  }

  toggleAutoCopy(cx) {
    this.autoCopy = !this.autoCopy;
    localStorage.setItem(STORAGE.autoCopy, String(this.autoCopy));
    cx.notify();
  }

  toggleContext(cx) {
    this.contextOpen = !this.contextOpen;
    localStorage.setItem(STORAGE.contextOpen, String(this.contextOpen));
    cx.notify();
  }

  hasAnyText() {
    return Boolean(this.contextText.trim() || this.inputText.trim() || this.outputText.trim());
  }

  clearContext(cx) {
    if (this.busy) return;
    this.contextText = "";
    this.contextInput.set_value("");
    this.inputRevision++;
    cx.notify();
  }

  clearEditor(cx) {
    if (this.busy) return;
    this.contextText = "";
    this.contextInput.set_value("");
    this.inputText = "";
    this.input.set_value("");
    this.outputText = "";
    this.outputInput.set_value("");
    this.inputRevision++;
    this.error = null;
    this.note = null;
    cx.notify();
  }

  copyOutput(cx, text = this.outputText, outputType = this.outputType) {
    if (!String(text ?? "").trim()) return;
    const token = ++this.copySeq;
    cx.spawn(async (cx) => {
      try {
        const res = await copyFormatted(text, outputType, cx);
        this.copiedAt = token;
        this.error = null;
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
      } catch (error) {
        this.copiedAt = 0;
        this.error = `Copy failed: ${error.message}`;
        cx.notify();
      }
    });
  }

  reRewriteFromOutput(cx) {
    if (!this.outputText.trim() || this.busy) return;
    this.inputText = this.outputText;
    this.input.set_value(this.outputText);
    this.inputRevision++;
    this.runRewrite(cx);
  }

  runRewrite(cx) {
    const raw = this.inputText.trim();
    if (!raw || this.busy) return;

    const aiSettings = this.settings?.ai ?? DEFAULT_SETTINGS.ai;
    const maxChars = Math.min(28000, Math.max(1000, aiSettings.max_input_chars ?? 24000));
    let built;
    try {
      built = buildBoundedPrompt({
        rewriteType: this.rewriteType,
        outputType: this.outputType,
        context: this.contextText,
        input: raw,
        customRewriteTypes: this.settings?.rewrite_types,
        maxChars,
      });
    } catch (error) {
      this.error = error.message;
      cx.notify();
      return;
    }

    this.busy = true;
    this.error = null;
    this.note = built.contextTruncated ? "Context was trimmed to fit the prompt character limit." : null;
    cx.notify();

    const revision = this.inputRevision;
    const harnessSetting = this.harness || aiSettings.harness || "auto";
    const snapshot = {
      rewriteType: this.rewriteType,
      outputType: this.outputType,
      context: this.contextText,
      input: raw,
    };

    cx.spawn(async (cx) => {
      try {
        const result = await runRewritePrompt({ prompt: built.prompt, harnessSetting, aiSettings });
        const historySaved = await this.recordHistory({
          ...snapshot,
          harness: result.harness,
          model: result.model,
          output: result.text,
        });
        if (this.inputRevision !== revision) {
          this.note = historySaved
            ? "Input changed while rewriting; result saved to history."
            : "Input changed while rewriting; history save failed.";
          return;
        }
        this.outputText = result.text;
        this.outputInput.set_value(result.text);
        const notes = [`Rewritten with ${result.label} (${result.model})`];
        if (built.contextTruncated) notes.push("context trimmed");
        if (!historySaved) notes.push("history save failed");
        this.note = notes.join(" · ");
        if (this.autoCopy) this.copyOutput(cx, result.text, snapshot.outputType);
      } catch (error) {
        this.error = `Rewrite failed: ${error.message}`;
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  async recordHistory(entryData) {
    await this.historyLoaded;
    const maxItems = this.settings?.history?.max_items ?? 20;
    const entry = createHistoryEntry(entryData);
    this.history = addHistoryEntry(this.history, entry, maxItems);
    try {
      await saveHistory(`${appHome()}/data/rewrite`, this.history, HISTORY_IO);
      return true;
    } catch (error) {
      console.warn(`Failed to save rewrite history: ${error.message}`);
      return false;
    }
  }

  toggleHistoryItem(id, cx) {
    this.expandedHistoryId = this.expandedHistoryId === id ? null : id;
    cx.notify();
  }

  copyHistoryItem(item, cx) {
    if (!String(item?.output ?? "").trim()) return;
    const token = ++this.copySeq;
    cx.spawn(async (cx) => {
      try {
        const res = await copyFormatted(item.output, item.outputType, cx);
        this.copiedHistoryId = item.id;
        this.copiedHistoryToken = token;
        this.error = null;
        if (res.fallback) {
          this.note = "Rich copy unavailable; copied plain text instead.";
        }
        cx.notify();
        cx.timer.after(1500, (cx) => {
          if (this.copiedHistoryToken === token) {
            this.copiedHistoryId = null;
            cx.notify();
          }
        });
      } catch (error) {
        this.copiedHistoryId = null;
        this.error = `Copy failed: ${error.message}`;
        cx.notify();
      }
    });
  }

  loadHistoryItem(item, cx) {
    if (!item || this.busy) return;
    this.contextText = item.context ?? "";
    this.contextInput.set_value(this.contextText);
    if (this.contextText.trim()) {
      this.contextOpen = true;
      localStorage.setItem(STORAGE.contextOpen, "true");
    }
    this.inputText = item.input ?? "";
    this.input.set_value(this.inputText);
    this.outputText = item.output ?? "";
    this.outputInput.set_value(this.outputText);
    this.inputRevision++;

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
    cx.spawn(async (cx) => {
      try {
        await this.historyLoaded;
        await saveHistory(`${appHome()}/data/rewrite`, this.history, HISTORY_IO);
      } catch (e) {
        this.note = `Failed to save history: ${e.message}`;
        cx.notify();
      }
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
    cx.spawn(async (cx) => {
      try {
        await this.historyLoaded;
        await saveHistory(`${appHome()}/data/rewrite`, [], HISTORY_IO);
      } catch (e) {
        this.note = `Failed to clear history: ${e.message}`;
        cx.notify();
      }
    });
  }
}

Object.assign(RewriteView.prototype, panelMethods);

export default RewriteView;
