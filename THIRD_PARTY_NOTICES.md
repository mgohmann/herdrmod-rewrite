# Third-Party Notices & Provenance

This project is licensed under the MIT License (see [LICENSE](LICENSE)). Portions of the mod's scaffolding, UI primitives, and icons are adapted from or include the following third-party open-source projects:

---

## 1. `munza/herdr-mods` (`better-changes`) — Apache License 2.0

- **Source:** https://github.com/munza/herdr-mods
- **License:** Apache-2.0
- **Adapted components:**
  - `panel.js` (adapted from `better-changes/panel.js` for `mod.open:rewrite` layout open/toggle commands)
  - `settings.js` / `settings-core.js` (adapted from `better-changes/settings.js` duration parsing and settings deep-merge)
  - `views/ui.js` (GPUI layout tokens and UI component conventions adapted from `better-changes/views/ui.js`: `Panel`, `PanelHeader`, `IconButton`, `TextButton`, `Menu`, `MenuOption`, `TextBox`, `Message`)
  - `mod.schema.json` (Herdr mod manifest schema structure)
  - `ai.js` / `ai-core.js` (multi-harness non-interactive CLI runner pattern inspired by `dev-config`'s `better-changes/ai.js` addition)

```text
Licensed under the Apache License, Version 2.0 (the "License");
you may not use these files except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

## 2. Lucide Icons (`icons/*.svg`) — ISC License

- **Source:** https://lucide.dev / https://github.com/lucide-icons/lucide
- **License:** ISC
- **Files:** `icons/rewrite.svg`, `icons/sparkle.svg`, `icons/copy.svg`, `icons/check.svg`, `icons/chevron-down.svg`, `icons/chevron-right.svg`, `icons/refresh.svg`, `icons/undo.svg`, `icons/trash.svg`

```text
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```
