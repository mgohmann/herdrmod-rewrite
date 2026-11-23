# Herdr Mod: `rewrite` — Design Spec & Implementation Plan

## 1. Overview

**`rewrite`** is a standalone right-side panel mod for the [Herdr](https://herdr.dev) desktop app. It lets you paste (or voice-dictate) rough text, optionally attach background context, choose a **Rewrite Type** and **Output Type**, and send a minimal-context, single-shot request to your local coding-agent CLI harness. The rewritten result appears in an editable output box with one-click (or automatic) clipboard copy and a persistent local history.

### Design Principles
- **Standalone & install-ready:** Self-contained Herdr mod (`mod.json`, `mod.schema.json`, `main.js`, `icons/`) ready to drop into `~/.config/herdr-app/mods/rewrite/`.
- **Minimal-context, zero side effects:** Reuses the non-interactive harness execution pattern from `better-changes/ai.js`—runs in a neutral folder (`appHome()/data/rewrite`) with tools disabled (or read-only agent) so it never inspects or modifies repositories.
- **Fast & lightweight by default:** Always defaults to `low` reasoning effort and lightweight/fast models (e.g., `haiku`, `gemini-4-hydrogen`, `gpt-6-luna`), configurable via `mod.json` (`better-config` compatible).
- **Compact vertical UX:** Designed for a narrow right-hand sidebar panel (~368px wide), keeping the optional Context box compact/collapsible so input, output, and history remain comfortable to use.

---

## 2. Repository & Mod File Structure

```text
C:\wd\herdrmod-rewrite\
├── IMPLEMENTATION_PLAN.md   # This design spec & phased plan
├── README.md                # Installation, layout wiring, and configuration docs
├── ui-ideation.png          # Initial UI wireframe reference
├── mod.json                 # Herdr mod manifest (place: "right", size: 368, default settings)
├── mod.schema.json          # JSON Schema (draft 2020-12) for editor validation & better-config UI
├── jsconfig.json            # Editor/LSP config referencing gpui-kit.d.ts
├── main.js                  # RewriteView (extends View), state lifecycle, commands, overlay panel key
├── settings.js              # Deep-merge mod.json settings over defaults (same pattern as better-changes)
├── panel.js                 # Layout open/toggle helper for mod.open:rewrite keybinding
├── ai.js                    # Multi-harness non-interactive CLI runner & response cleaner
├── prompts.js               # Built-in Rewrite Types, Output Types, and prompt builder
├── clipboard.js             # Plain-text copy + Windows CF_HTML rich-text copy for Outlook
├── history.js               # Persistent JSON history store (capped at 20 items)
├── views/
│   ├── panel.js             # Main sidebar UI (controls, context, input, output, history)
│   └── ui.js                # Herdr-native GPUI primitives (Panel, Popover dropdowns, IconButton, etc.)
└── icons/
    ├── rewrite.svg          # Tab/panel icon
    ├── sparkle.svg          # Rewrite action / spinner
    ├── copy.svg             # Copy to clipboard
    ├── check.svg            # Copied confirmation / active option check
    ├── chevron-down.svg     # Dropdowns & expandable sections
    ├── chevron-right.svg    # Collapsed sections
    ├── refresh.svg          # Re-rewrite / iterate
    ├── undo.svg             # Load history item back into editor
    ├── trash.svg            # Delete history item / Clear
    └── settings.svg         # Harness / options menu
```

---

## 3. UI & UX Specification

The panel docks on the right (`place: "right"`, default width `368px`) inside the layout's `panel-body` stack (alongside Files, Changes, PRs, Inbox).

```text
┌─────────────────────────────────────────────┐
│ Rewrite          [Harness ▾] [Auto-copy] [⌫]│  <- Header / Quick controls
├─────────────────────────────────────────────┤
│ [Type: Default ▾]  [Output: Markdown ▾]     │  <- Primary option dropdowns
├─────────────────────────────────────────────┤
│ ▸ Context (optional)              [Clear]   │  <- Collapsible, fixed compact height (3 rows max)
│ ┌─────────────────────────────────────────┐ │
│ │ Paste questions, email thread, notes... │ │  <- Internal scroll; never grows vertically
│ └─────────────────────────────────────────┘ │
│ Rewrite this                                │
│ ┌─────────────────────────────────────────┐ │
│ │ Paste or dictate text to rewrite...     │ │  <- Multi-line Textarea (5–6 rows)
│ │                                         │ │     Ctrl+Enter triggers Rewrite
│ └─────────────────────────────────────────┘ │
│                             [✦ Rewrite]     │  <- Primary button (shows spinner while busy)
├─────────────────────────────────────────────┤
│ Rewritten Content     [↻ Re-rewrite] [Copy] │  <- Action bar (shows "Copied" feedback)
│ ┌─────────────────────────────────────────┐ │
│ │ Editable rewritten output...            │ │  <- Editable Textarea (6–8 rows)
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ History (4/20)                   [Clear All]│  <- Scrollable list of recent rewrites
│ ▾ Professionalize · Markdown · 2m ago       │
│   "Hi team, following up on the Q3..."      │  <- Expanded: shows response + actions
│   [Copy] [Load] [Re-rewrite] [Delete]       │
│ ▸ Answer Questions · Outlook Rich · 18m ago │  <- Collapsed: 1–2 line preview
└─────────────────────────────────────────────┘
```

### Interaction Details
1. **Top Controls:**
   - **Rewrite Type dropdown** (`Popover` menu): Selects from built-in and custom rewrite types. Persisted in `localStorage`.
   - **Output Type dropdown** (`Popover` menu): Selects from the 5 output formats. Persisted in `localStorage`.
   - **Harness selector** (compact pill/dropdown in header): Defaults to `Auto` (uses active tab's agent, else first installed), or lets the user pick any configured harness (`Claude`, `Antigravity`, `Copilot`, `Codex`, `OpenCode`).
   - **Auto-copy toggle:** Small toggle button/icon in header (`localStorage`-persisted). When enabled, completing a rewrite automatically copies the output (using rich copy if `Outlook Rich Text` is selected).
   - **Clear button:** Resets the current Context, Rewrite input, and Rewritten output boxes (does not wipe History).
2. **Context Box (Optional):**
   - Collapsible section (`▸ Context (optional)`), collapsed or compact by default when empty, with a subtle indicator when it contains text.
   - **Strict height cap:** Fixed compact `Textarea` (`rows: 3`, fixed max height with internal scrolling) so pasting a large email thread or list of 10 questions never pushes the main rewrite UI off-screen.
3. **Rewrite Input Box:**
   - Multi-line `TextareaState` (`rows: 5`).
   - **Keyboard trigger:** `Ctrl+Enter` (and `Cmd+Enter`) submits the rewrite; plain `Enter` inserts a newline.
   - **Rewrite button:** Disabled when input is empty or a rewrite is in flight; shows a spinning icon + status label (`Rewriting with Claude...`) while running.
4. **Rewritten Content Box:**
   - **Editable `TextareaState`** so the user can make quick manual tweaks before copying.
   - **Copy button:** Copies the current (possibly edited) text. Uses Windows `CF_HTML` rich copy when Output Type is `Outlook Rich Text`, and `cx.write_to_clipboard()` for all other output types. Shows a brief `Copied` confirmation state.
   - **Re-rewrite button:** Copies the current rewritten output into the Rewrite input box (or re-runs directly on it) so the user can iterate—e.g., first run *Answer Questions*, then *Professionalize*.
5. **History Section:**
   - Displays up to 20 most recent entries, newest first.
   - Collapsed row shows a 1-line preview of the rewritten text + metadata badges (Rewrite Type, Output Type, relative time) + quick **Copy** icon.
   - Clicking a row expands it to display the full rewritten response and action buttons:
     - **Copy:** Copies using the entry's output format (including rich copy for `Outlook Rich Text`).
     - **Load:** Restores the full snapshot (`context`, `input`, `rewriteType`, `outputType`, `output`) back into the active editor boxes.
     - **Re-rewrite:** Loads the snapshot and immediately triggers a fresh rewrite.
     - **Delete:** Removes that individual entry from disk.
   - **Clear All** button in the History header (with a lightweight two-click confirm like `Confirm clear?` to avoid accidental wipes).

---

## 4. Rewrite Types & Output Types

### Built-in Rewrite Types (v1)

| ID | Label | Prompt Intent |
|---|---|---|
| `default` | **Default** | Clean up grammar, spelling, clarity, and flow. Improve paragraph structure and use bullet points where helpful while preserving the user's voice and meaning. |
| `professionalize` | **Professionalize** | Rewrite into polished, clear, accurate language suitable for a professional email, Teams message, or business document. Clarify or define ambiguous acronyms/terms where appropriate and maintain a respectful, direct tone. |
| `answer-questions` | **Answer Questions** | Structure rough or voice-dictated answers so they cleanly align with the questions being answered (from Context if provided, or inferred from the input). Reorganize cross-referenced points into the right question without altering the user's actual answers or intent. |

> **Extensibility:** Users can override built-in prompts or add custom Rewrite Types under `settings.rewrite_types` in `mod.json`.

### Built-in Output Types (v1)

| ID | Label | Formatting & Clipboard Behavior |
|---|---|---|
| `markdown` | **Markdown** *(default)* | Standard GitHub-flavored Markdown (headings, bold, bullet lists, code ticks where appropriate). Copied as plain text. |
| `plain-text` | **Plain Text** | Clean plain text with no Markdown syntax (`**`, `#`, backticks). Uses clear spacing and simple `-` bullets if needed. Copied as plain text. |
| `obsidian-checklist` | **Obsidian Checklist** | Obsidian-compatible Markdown task list (`- [ ] ...`), grouping related items under brief headings or nested bullets if appropriate. Copied as plain text. |
| `outlook-plain` | **Outlook Plain Text** | Clean email-ready plain text formatted for Outlook (clear greeting/closing only if appropriate to input, short scannable paragraphs, clean indented bullets, zero raw Markdown symbols). Copied as plain text. |
| `outlook-rich` | **Outlook Rich Text** | Formats cleanly with semantic HTML (or Markdown converted deterministically to clean Outlook-safe inline HTML: `<p>`, `<strong>`, `<ul>/<li>`, `<h3>`). Displays readable text/markdown in the editable box, and **Copy** writes both **Windows `CF_HTML`** (for rich paste into Outlook/Teams/Word) and **plain-text fallback** to the clipboard. |

### Outlook Rich Text Clipboard Strategy (`clipboard.js`)
- Herdr's built-in `cx.write_to_clipboard(text)` only sets `CF_UNICODETEXT`.
- For `outlook-rich` on Windows:
  1. The AI outputs standard Markdown (so the user can read and edit it cleanly inside Herdr's plain-text `Textarea`!).
  2. When copying, `clipboard.js` runs a lightweight, deterministic Markdown-to-HTML converter (headings, bold, italic, bullets, numbered lists, line breaks, inline code, links) wrapped in clean Outlook-friendly styles (Calibri/Segoe UI inherited, compact margins).
  3. Invokes PowerShell (hidden, fast, no profile: `powershell -NoProfile -NonInteractive -STA ...`) using `System.Windows.Forms.DataObject` to set both `TextDataFormat.Html` (with proper `Version:0.9` `StartHTML`/`EndHTML`/`StartFragment`/`EndFragment` byte-offset header) and `TextDataFormat.UnicodeText` (stripped plain text) onto the Windows clipboard.
  4. On non-Windows or if PowerShell fails, gracefully falls back to `cx.write_to_clipboard()` with a subtle notice.

---

## 5. AI Harness Architecture (`ai.js`)

Reuses and extends the proven architecture from `better-changes/ai.js`:

### Supported Harnesses & Default Lightweight Models

| Harness ID | Label | CLI Command | Default Model | Effort | Notes |
|---|---|---|---|---|---|
| `claude` | Claude Code | `claude` | `haiku` | `low` | `-p --tools "" --no-session-persistence --setting-sources "" --output-format text --model <m> --effort <e>` |
| `antigravity` | Antigravity | `agy` | `gemini-4-hydrogen` | `low` | `-p <text> --model <m>-<e> --mode plan --output-format text` |
| `copilot` | Copilot | `copilot` | `gpt-6-luna` | `low` | `-p <text> -s --model <m> --reasoning-effort <e> --no-ask-user --no-custom-instructions --disable-builtin-mcps --available-tools ""` |
| `codex` | Codex | `codex` | `gpt-6-luna` | `low` | Non-interactive `codex exec` with lightweight model & low reasoning effort (exact flags verified against installed `codex` CLI in Phase 2) |
| `opencode` | OpenCode | `opencode` | `openrouter/openai/gpt-6-luna` | `low` | `run -m <m>#<e> --agent plan -f <file> "..."` (`needsFile: true`) |

### Execution Details
- **Harness resolution (`auto`):** Inspects terminals in the active Herdr tab (focused pane first) to match the running agent, then falls back through the configured order (`["claude", "antigravity", "copilot", "codex", "opencode"]`). If the user picks a specific harness in the UI or `mod.json`, only that harness is used.
- **Neutral working directory:** Runs `exec(...)` with `cwd: "${appHome()}/data/rewrite"` (directory created on first use) so the CLI never reads project files or `.git`.
- **Prompt length & Windows safety:** Prompts exceeding a configurable threshold (e.g., `24000` chars) or harnesses with `.cmd` shims (`needsFile: true`) pass the prompt via a temp file (`appHome()/data/rewrite/prompt.txt`) or stdin where supported, avoiding Windows' ~32K command-line limit.
- **Response hygiene (`cleanOutput`):** Strips ANSI escape codes, carriage returns, OpenCode banners (`> agent · model`), and accidental outer markdown fences (` ``` `) if the AI wraps the entire response, while preserving internal formatting and code blocks.
- **Settings in `mod.json`:** All harness models, effort (`low` default), timeout (`90s` default), and `max_input_chars` live under `settings.ai` with full `mod.schema.json` definitions so they are editable in both JSON and `better-config`.

---

## 6. History Persistence (`history.js`)

- **Storage path:** `${appHome()}/data/rewrite/history.json`
- **Cap:** `20` items by default (configurable via `settings.history.max_items`, range `1–100`). Oldest entries roll off automatically on insert.
- **Schema per entry:**
  ```json
  {
    "id": "1763897100000-a1b2",
    "createdAt": "2026-11-23T12:05:00.000Z",
    "rewriteType": "professionalize",
    "outputType": "outlook-rich",
    "harness": "claude",
    "model": "haiku",
    "context": "Optional pasted context...",
    "input": "Original text to rewrite...",
    "output": "Rewritten response..."
  }
  ```
- **Context size guard:** Optionally truncates stored `context` in history above a safe limit (e.g., 20KB) so `history.json` stays fast to read/write on every panel open.

---

## 7. Layout Integration

To wire the mod into a Herdr layout (e.g., `estro.json` in `dev-config`):
1. Copy/install the mod folder to `~/.config/herdr-app/mods/rewrite/`.
2. Add a tab button in `better-tabs` `props.buttons`:
   ```json
   {
     "id": "rewrite",
     "label": "Rewrite",
     "icon": "mods/rewrite/icons/rewrite.svg",
     "group": "panels",
     "action": {
       "type": "panel",
       "container": "panel",
       "stack": "panel-body",
       "target": "rewrite"
     }
   }
   ```
3. Add the block to `panel-body` `children`:
   ```json
   {
     "id": "rewrite",
     "type": "block",
     "content": {
       "mod": "rewrite"
     }
   }
   ```
4. Optional keybinding (`mod.open:rewrite`) supported via `panel.js` + `overlay` config in `mod.json`.

---

## 8. Phased Implementation Plan

### Phase 1: Mod Scaffolding, Settings Schema & Panel Shell
**Goal:** A loadable, valid Herdr right-side panel mod with all UI layout elements and state wiring (stubbed rewrite call).
- Create `mod.json`, `mod.schema.json`, `jsconfig.json`, `settings.js`, `panel.js`, and SVG icons in `icons/`.
- Build `views/ui.js` (Herdr theme tokens, `Panel`, `PanelHeader`, `Popover` dropdown, `IconButton`, `TextButton`, `ActionButton`, collapsible section).
- Build `main.js` and `views/panel.js` with:
  - Header controls (Harness dropdown, Auto-copy toggle, Clear button).
  - Rewrite Type & Output Type dropdowns (`localStorage`-persisted).
  - Collapsible, height-capped Context `TextareaState`.
  - Main Rewrite `TextareaState` with `Ctrl+Enter` / `Cmd+Enter` handler and Rewrite button.
  - Editable Output `TextareaState` with Copy and Re-rewrite buttons.
- **Verification:** Load mod in Herdr (`herdr-app check` / reload), confirm panel renders cleanly at 368px width, dropdowns open/close, context box stays compact on large paste, and `mod.schema.json` validates `mod.json`.

### Phase 2: Prompt Engine & Multi-Harness AI Runner
**Goal:** End-to-end live rewriting using your installed coding-agent CLI harnesses.
- Implement `prompts.js` with the 3 v1 Rewrite Types (`default`, `professionalize`, `answer-questions`), 5 Output Types, and support for custom types from `mod.json` `settings`.
- Implement `ai.js` supporting `auto`, `claude`, `antigravity`, `copilot`, `codex`, and `opencode` (verifying `codex` CLI non-interactive flags on this machine during implementation).
- Wire `RewriteView.runRewrite(cx)` with busy/spinner state, error banner display, and response sanitization.
- **Verification:** Test each Rewrite Type (especially *Answer Questions* with out-of-order dictated answers + Context questions) and verify harness auto-detection, explicit harness override, and clean error reporting when a harness fails or times out.

### Phase 3: Output Formatting & Windows Outlook Rich Copy
**Goal:** Accurate output formatting across all 5 Output Types and working rich-text paste into Outlook.
- Implement `clipboard.js`:
  - Plain-text copy via `cx.write_to_clipboard()`.
  - Deterministic Markdown → Outlook-safe HTML converter.
  - Windows `CF_HTML` + `CF_UNICODETEXT` clipboard writer via PowerShell `DataObject`, with automatic fallback to plain text.
- Wire Auto-copy on complete toggle and Copy button visual feedback (`Copied`).
- **Verification:** Copy an `Outlook Rich Text` output and paste directly into Outlook/Word (verify bold, headings, and bullet lists render cleanly) and into Notepad (verify clean plain-text fallback). Verify `Obsidian Checklist` produces valid `- [ ]` tasks and `Outlook Plain Text` has no raw Markdown tokens.

### Phase 4: Persistent History & Iteration Workflows
**Goal:** Full 20-item disk-backed history with expand, copy, load-back, re-rewrite, delete, and clear-all.
- Implement `history.js` reading/writing `${appHome()}/data/rewrite/history.json` with atomic-safe writes, 20-item cap, and entry deletion.
- Build the History list UI in `views/panel.js`:
  - Collapsed preview rows with quick Copy icon.
  - Expanded view showing the full rewritten response and `Copy` / `Load` / `Re-rewrite` / `Delete` actions.
  - `Clear All` with two-step confirmation.
- **Verification:** Run multiple rewrites, reload Herdr, confirm history persists; test Load restoring context/input/options/output; test Re-rewrite from both the output box and a history item; verify cap enforces 20 items cleanly.

### Phase 5: Polish, Edge Cases & Documentation
**Goal:** Production-ready standalone mod.
- Handle edge cases: rapid double-submit protection, very long context inputs, empty/whitespace inputs, missing `data/rewrite` folder on fresh install, theme switching (light & dark themes).
- Add unit tests (Node test runner) for pure modules: `prompts.js`, `ai.js` (`harnessOrder`, `cleanOutput`), `clipboard.js` (Markdown→HTML & `CF_HTML` byte offsets), `history.js`, and `panel.js`.
- Write a complete `README.md` with install steps, layout JSON snippet, and `mod.json` settings reference.

---

## 9. Backlog / Future Enhancements

Deferred intentionally so v1 stays focused and fast:
1. **Additional Rewrite Types:**
   - **Persuade & Sell It** (compelling, benefit-oriented pitch/proposal framing).
   - **Research / Grammar & Technical** (technical precision, formal accuracy, clear terminology).
2. **Multi-Variation Mode:** Configurable option to request 2–3 distinct rewrite variations per run (e.g., concise / balanced / detailed) selectable via mini-tabs in the output box.
3. **In-Panel Configuration Menu:** Dedicated settings popover/drawer inside the mod for tweaking models, effort, and custom rewrite prompts without opening `mod.json` or `better-config`.
4. **Cross-Platform Rich Clipboard:** macOS (`pbcopy` / `osascript` RTF/HTML) and Linux (`xclip` / `wl-copy` `text/html`) support for `Outlook Rich Text`.
5. **Diff View Toggle:** Optional inline diff comparing original input vs. rewritten output.
