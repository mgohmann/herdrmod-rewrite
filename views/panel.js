// views/panel.js: Main Rewrite sidebar panel layout and interactions.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme } from "herdr";
import { formatRelativeTime, previewText } from "../history.js";
import { resolveOutputType, resolveRewriteType } from "../prompts.js";
import {
  TEXT,
  RADIUS,
  Panel,
  PanelHeader,
  Badge,
  Icon,
  IconButton,
  TextButton,
  ActionButton,
  DropdownTrigger,
  Menu,
  MenuLabel,
  MenuOption,
  TextBox,
  Message,
} from "./ui.js";

export const panelMethods = {
  render() {
    if (this.mode === "panel-key") return div();
    return Panel({ id: "rewrite-panel" })
      .child(this.renderHeader())
      .child(this.renderOptionBar())
      .child(
        v_flex()
          .id("rewrite-scroll")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .px(10)
          .py(8)
          .gap(10)
          .child(this.renderContextSection())
          .child(this.renderInputSection())
          .when(Boolean(this.error), (el) => el.child(Message(this.error, true)))
          .when(Boolean(this.note), (el) => el.child(Message(this.note, false)))
          .child(this.renderOutputSection())
          .child(this.renderHistorySection()),
      );
  },

  renderHeader() {
    const t = theme();
    const harnessLabel = this.harnessLabel(this.harness);
    return PanelHeader()
      .child(
        h_flex()
          .flex_1()
          .min_w(0)
          .gap(6)
          .items_center()
          .child(Icon("rewrite", 15).text_color(t.muted))
          .child(div().font_medium().text_size(TEXT.body).child("Rewrite")),
      )
      .child(
        Menu({
          id: "harness-menu",
          open: this.harnessMenuOpen,
          onOpenChange: (open, cx) => {
            this.harnessMenuOpen = open;
            cx.notify();
          },
          focus: this.harnessMenuFocus,
          anchor: "top_right",
          width: 190,
          trigger: h_flex()
            .id("harness-trigger")
            .h(24)
            .px(7)
            .gap(4)
            .items_center()
            .rounded(RADIUS.control)
            .border_1()
            .border_color(t.border)
            .bg(t.raised)
            .text_size(TEXT.caption)
            .text_color(t.muted)
            .cursor_pointer()
            .hover((s) => s.bg(t.hover).text_color(t.foreground))
            .tooltip("Select AI harness (default: Auto)")
            .child(div().truncate().child(harnessLabel))
            .child(Icon("chevron-down", 11).text_color(t.dim)),
          children: [
            MenuLabel("Coding Agent Harness"),
            ...this.harnessOptions().map((opt) =>
              MenuOption({
                id: `harness-${opt.id}`,
                label: opt.label,
                detail: opt.detail,
                selected: this.harness === opt.id,
                onClick: (cx) => {
                  this.harnessMenuOpen = false;
                  this.setHarness(opt.id, cx);
                },
              }),
            ),
          ],
        }),
      )
      .child(
        IconButton({
          id: "auto-copy-toggle",
          icon: "copy",
          label: this.autoCopy ? "Auto-copy on complete: ON" : "Auto-copy on complete: OFF",
          active: this.autoCopy,
          onClick: (cx) => this.toggleAutoCopy(cx),
        }),
      )
      .child(
        IconButton({
          id: "clear-all-inputs",
          icon: "trash",
          label: "Clear context, input, and output",
          disabled: !this.hasAnyText() || this.busy,
          onClick: (cx) => this.clearEditor(cx),
        }),
      );
  },

  renderOptionBar() {
    const t = theme();
    const rewriteTypes = this.availableRewriteTypes();
    const outputTypes = this.availableOutputTypes();
    const currentRewrite = rewriteTypes.find((r) => r.id === this.rewriteType) ?? rewriteTypes[0];
    const currentOutput = outputTypes.find((o) => o.id === this.outputType) ?? outputTypes[0];

    return h_flex()
      .flex_none()
      .px(10)
      .py(8)
      .gap(6)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .child(
        div()
          .flex_1()
          .min_w(0)
          .child(
            Menu({
              id: "rewrite-type-menu",
              open: this.rewriteMenuOpen,
              onOpenChange: (open, cx) => {
                this.rewriteMenuOpen = open;
                cx.notify();
              },
              focus: this.rewriteMenuFocus,
              anchor: "top_left",
              width: 220,
              trigger: DropdownTrigger({
                id: "rewrite-type-trigger",
                prefix: "Type:",
                label: currentRewrite?.label ?? "Default",
              }),
              children: [
                MenuLabel("Rewrite Type"),
                ...rewriteTypes.map((opt) =>
                  MenuOption({
                    id: `rewrite-type-${opt.id}`,
                    label: opt.label,
                    detail: opt.summary,
                    selected: this.rewriteType === opt.id,
                    onClick: (cx) => {
                      this.rewriteMenuOpen = false;
                      this.setRewriteType(opt.id, cx);
                    },
                  }),
                ),
              ],
            }),
          ),
      )
      .child(
        div()
          .flex_1()
          .min_w(0)
          .child(
            Menu({
              id: "output-type-menu",
              open: this.outputMenuOpen,
              onOpenChange: (open, cx) => {
                this.outputMenuOpen = open;
                cx.notify();
              },
              focus: this.outputMenuFocus,
              anchor: "top_right",
              width: 220,
              trigger: DropdownTrigger({
                id: "output-type-trigger",
                prefix: "Out:",
                label: currentOutput?.label ?? "Markdown",
              }),
              children: [
                MenuLabel("Output Format"),
                ...outputTypes.map((opt) =>
                  MenuOption({
                    id: `output-type-${opt.id}`,
                    label: opt.label,
                    detail: opt.summary,
                    selected: this.outputType === opt.id,
                    onClick: (cx) => {
                      this.outputMenuOpen = false;
                      this.setOutputType(opt.id, cx);
                    },
                  }),
                ),
              ],
            }),
          ),
      );
  },

  renderContextSection() {
    const t = theme();
    const hasContext = Boolean(this.contextText.trim());
    return v_flex()
      .flex_none()
      .gap(5)
      .child(
        h_flex()
          .items_center()
          .gap(4)
          .child(
            h_flex()
              .id("context-toggle")
              .flex_1()
              .min_w(0)
              .gap(5)
              .items_center()
              .cursor_pointer()
              .text_size(TEXT.caption)
              .text_color(t.muted)
              .hover((s) => s.text_color(t.foreground))
              .on_click((_e, cx) => this.toggleContext(cx))
              .child(Icon(this.contextOpen ? "chevron-down" : "chevron-right", 12))
              .child(div().font_medium().child("Context (optional)"))
              .when(hasContext && !this.contextOpen, (el) => el.child(Badge("added", true))),
          )
          .when(hasContext, (el) =>
            el.child(
              TextButton({
                id: "clear-context",
                label: "Clear",
                onClick: (cx) => this.clearContext(cx),
              }),
            ),
          ),
      )
      .when(this.contextOpen, (el) =>
        el.child(
          TextBox({
            id: "context-input",
            state: this.contextInput,
            focused: this.contextFocused,
            label: "Optional context",
            height: 70,
          }),
        ),
      );
  },

  renderInputSection() {
    const t = theme();
    const canSubmit = Boolean(this.inputText.trim()) && !this.busy;
    const shortcutHint = this.isMac ? "Cmd+Enter" : "Ctrl+Enter";
    const busyLabel =
      this.harness === "auto" ? "Rewriting..." : `Rewriting with ${this.harnessLabel(this.harness)}...`;
    return v_flex()
      .flex_none()
      .gap(6)
      .child(
        h_flex()
          .items_center()
          .child(
            div()
              .flex_1()
              .text_size(TEXT.caption)
              .font_medium()
              .text_color(t.muted)
              .child("Rewrite this"),
          )
          .child(div().text_size(TEXT.badge).text_color(t.dim).child(shortcutHint)),
      )
      .child(
        TextBox({
          id: "rewrite-input",
          state: this.input,
          focused: this.inputFocused,
          label: "Text to rewrite",
          height: 108,
          onKeyDown: (event, cx) => {
            if (event.keystroke === "cmd-enter" || event.keystroke === "ctrl-enter") {
              cx.stop_propagation();
              this.runRewrite(cx);
            }
          },
        }),
      )
      .child(
        h_flex()
          .justify_end()
          .gap(6)
          .child(
            ActionButton({
              id: "rewrite-submit",
              icon: "sparkle",
              label: this.busy ? busyLabel : "Rewrite",
              enabled: canSubmit,
              spinning: this.busy,
              onClick: (cx) => this.runRewrite(cx),
            }),
          ),
      );
  },

  renderOutputSection() {
    const t = theme();
    const hasOutput = Boolean(this.outputText.trim());
    return v_flex()
      .flex_none()
      .pt(6)
      .gap(6)
      .border_t(1)
      .border_color(t.border)
      .child(
        h_flex()
          .items_center()
          .gap(4)
          .child(
            div()
              .flex_1()
              .text_size(TEXT.caption)
              .font_medium()
              .text_color(t.muted)
              .child("Rewritten content"),
          )
          .child(
            TextButton({
              id: "re-rewrite-btn",
              icon: "refresh",
              label: "Re-rewrite",
              disabled: !hasOutput || this.busy,
              onClick: (cx) => this.reRewriteFromOutput(cx),
            }),
          )
          .child(
            TextButton({
              id: "copy-output-btn",
              icon: this.copiedAt ? "check" : "copy",
              label: this.copiedAt ? "Copied" : "Copy",
              active: Boolean(this.copiedAt),
              disabled: !hasOutput,
              onClick: (cx) => this.copyOutput(cx),
            }),
          ),
      )
      .child(
        TextBox({
          id: "rewrite-output",
          state: this.outputInput,
          focused: this.outputFocused,
          label: "Rewritten content",
          height: 132,
        }),
      );
  },

  renderHistorySection() {
    const t = theme();
    const maxItems = this.settings?.history?.max_items ?? 20;
    return v_flex()
      .flex_none()
      .pt(6)
      .gap(6)
      .border_t(1)
      .border_color(t.border)
      .child(
        h_flex()
          .items_center()
          .gap(6)
          .child(div().text_size(TEXT.caption).font_medium().text_color(t.muted).child("History"))
          .child(Badge(`${this.history.length}/${maxItems}`))
          .child(div().flex_1())
          .when(this.history.length > 0, (el) =>
            el.child(
              TextButton({
                id: "history-clear-all",
                label: this.confirmClearHistory ? "Confirm clear?" : "Clear All",
                danger: this.confirmClearHistory,
                onClick: (cx) => this.clearAllHistory(cx),
              }),
            ),
          ),
      )
      .when(!this.history.length, (el) =>
        el.child(
          div()
            .px(4)
            .py(4)
            .text_size(TEXT.small)
            .text_color(t.dim)
            .child("No rewrites yet. Recent rewrites will appear here."),
        ),
      )
      .when(this.history.length > 0, (el) =>
        el.child(
          v_flex()
            .id("history-list")
            .max_h(260)
            .overflow_y_scrollbar()
            .gap(6)
            .children(this.history.map((item) => this.renderHistoryItem(item))),
        ),
      );
  },

  renderHistoryItem(item) {
    const t = theme();
    const expanded = this.expandedHistoryId === item.id;
    const copied = this.copiedHistoryId === item.id;
    const rwLabel = resolveRewriteType(item.rewriteType, this.settings?.rewrite_types).label;
    const outLabel = resolveOutputType(item.outputType).label;
    const when = formatRelativeTime(item.createdAt);

    return v_flex()
      .id(`history-${item.id}`)
      .rounded(RADIUS.control)
      .border_1()
      .border_color(expanded ? t.accent : t.border)
      .bg(t.raised)
      .overflow_hidden()
      .child(
        h_flex()
          .id(`history-row-${item.id}`)
          .px(8)
          .py(6)
          .gap(6)
          .items_center()
          .cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.toggleHistoryItem(item.id, cx))
          .child(Icon(expanded ? "chevron-down" : "chevron-right", 12).text_color(t.dim))
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(2)
              .child(
                div()
                  .truncate()
                  .text_size(TEXT.small)
                  .text_color(t.foreground)
                  .child(previewText(item.output) || "(empty)"),
              )
              .child(
                div()
                  .truncate()
                  .text_size(TEXT.badge)
                  .text_color(t.dim)
                  .child([rwLabel, outLabel, when].filter(Boolean).join(" · ")),
              ),
          )
          .child(
            IconButton({
              id: `history-quick-copy-${item.id}`,
              icon: copied ? "check" : "copy",
              label: copied ? "Copied" : "Copy response",
              small: true,
              active: copied,
              onClick: (cx) => this.copyHistoryItem(item, cx),
            }),
          ),
      )
      .when(expanded, (el) =>
        el.child(
          v_flex()
            .px(8)
            .pb(8)
            .pt(6)
            .gap(6)
            .border_t(1)
            .border_color(t.border)
            .bg(t.background)
            .child(
              div()
                .max_h(160)
                .overflow_y_scrollbar()
                .text_size(TEXT.small)
                .whitespace_normal()
                .text_color(t.foreground)
                .child(String(item.output ?? "")),
            )
            .child(
              h_flex()
                .gap(4)
                .items_center()
                .child(
                  TextButton({
                    id: `history-copy-${item.id}`,
                    icon: copied ? "check" : "copy",
                    label: copied ? "Copied" : "Copy",
                    active: copied,
                    onClick: (cx) => this.copyHistoryItem(item, cx),
                  }),
                )
                .child(
                  TextButton({
                    id: `history-load-${item.id}`,
                    icon: "undo",
                    label: "Load",
                    onClick: (cx) => this.loadHistoryItem(item, cx),
                  }),
                )
                .child(
                  TextButton({
                    id: `history-rerun-${item.id}`,
                    icon: "refresh",
                    label: "Re-rewrite",
                    disabled: this.busy,
                    onClick: (cx) => this.reRewriteHistoryItem(item, cx),
                  }),
                )
                .child(div().flex_1())
                .child(
                  TextButton({
                    id: `history-delete-${item.id}`,
                    icon: "trash",
                    label: "Delete",
                    danger: true,
                    onClick: (cx) => this.deleteHistoryItem(item.id, cx),
                  }),
                ),
            ),
        ),
      );
  },
};
