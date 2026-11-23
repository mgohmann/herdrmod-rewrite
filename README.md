# herdrmod-rewrite

A standalone **Rewrite** panel mod for [Herdr](https://herdr.dev) that turns rough or voice-dictated text into polished output using your local coding-agent CLI in a neutral, read-only context.

## Features

- **Rewrite Types:**
  - **Default:** Fixes grammar, spelling, clarity, and structure while preserving your voice.
  - **Professionalize:** Polishes text for professional emails, Microsoft Teams messages, or business docs.
  - **Answer Questions:** Structures rough or voice-dictated answers to match questions (using optional Context if provided), moving out-of-order points to the right question without changing your intent.
  - **Custom Types:** Override or add your own rewrite types in `mod.json` under `settings.rewrite_types`.
- **Output Types:**
  - `Markdown` (default), `Plain Text`, `Obsidian Checklist` (`- [ ]`), `Outlook Plain Text`, and `Outlook Rich Text` (displays editable Markdown in the panel and writes Windows `CF_HTML` + plain-text fallback on Copy).
- **Multi-Harness AI Runner:**
  - `Auto` mode detects the coding agent running in your active Herdr tab, falling back across `claude`, `antigravity` (`agy`), `copilot`, `codex`, and `opencode`.
  - Defaults to `low` reasoning effort and lightweight models (`haiku`, `gemini-4-hydrogen`, `gpt-6-luna`).
  - `max_input_chars` defaults to `24000` (clamped `1000..28000` for Windows CLI limits); long Context is trimmed first so your Input is preserved, and oversized Input alone is rejected cleanly.
- **Editable Output & Iteration:**
  - Tweak rewritten text inline, click **Re-rewrite** to iterate, or toggle **Auto-copy** on completion.
  - `Ctrl+Enter` / `Cmd+Enter` triggers a rewrite from the input box.
- **Persistent History:**
  - Saves up to 20 recent rewrites (`settings.history.max_items`) to `~/.config/herdr-app/data/rewrite/history.json` with expand, quick Copy, Load snapshot, Re-rewrite, Delete, and two-step Clear All.

## Installation

1. Copy this repository's mod files into your Herdr mods directory:
   ```powershell
   $dest = "$env:USERPROFILE\.config\herdr-app\mods\rewrite"
   New-Item -ItemType Directory -Force -Path $dest | Out-Null
   Copy-Item -Path C:\wd\herdrmod-rewrite\* -Destination $dest -Recurse -Force -Exclude .git,tests,IMPLEMENTATION_PLAN.md
   ```

2. Wire the mod into your Herdr layout (e.g. `estro.json`):
   - Add a tab button in `better-tabs` `props.buttons`:
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
   - Add the block to `panel-body` `children`:
     ```json
     {
       "id": "rewrite",
       "type": "block",
       "content": {
         "mod": "rewrite"
       }
     }
     ```

3. *(Optional)* Bind a shortcut to `mod.open:rewrite` in Herdr's keymap to open or toggle the panel.

## Configuration (`mod.json` `settings`)

All settings are optional and documented in [mod.schema.json](mod.schema.json) (compatible with `better-config`):

```json
{
  "settings": {
    "panel": { "toggle": false },
    "history": { "max_items": 20 },
    "ai": {
      "harness": "auto",
      "effort": "low",
      "timeout": "90s",
      "max_input_chars": 24000,
      "claude_model": "haiku",
      "antigravity_model": "gemini-4-hydrogen",
      "copilot_model": "gpt-6-luna",
      "codex_model": "gpt-6-luna",
      "opencode_model": "openrouter/openai/gpt-6-luna"
    },
    "rewrite_types": {
      "concise": {
        "label": "Concise",
        "prompt": "Rewrite to be as brief and direct as possible without losing key facts."
      }
    }
  }
}
```

## Development & Tests

Run the Node unit test suite:

```powershell
node --test tests/rewrite.test.mjs
```

## License & Provenance

- **License:** [MIT](LICENSE)
- **Third-Party Notices:** [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — credits `munza/herdr-mods` (`better-changes`, Apache-2.0) for the adapted Herdr panel/settings/UI primitives and Lucide (`lucide-static`, ISC) for the SVG icons.
