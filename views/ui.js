// views/ui.js: Herdr-native GPUI primitives for the Rewrite panel.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex, Popover, Textarea } from "gpui-base";
import { theme } from "herdr";

export const TEXT = { badge: 10, caption: 11, small: 12, menu: 12.8, body: 13 };
export const RADIUS = { small: 4, control: 6, row: 7, button: 8, panel: 10 };
export const SIZE = {
  button: 32,
  header: 42,
  row: 28,
  menu: 31,
  icon: 26,
  iconSmall: 20,
};
export const SPIN_MS = 900;

const ICONS = "mods/rewrite/icons";

export const Icon = (name, size = 14) => svg(`${ICONS}/${name}.svg`).size(size).flex_none();

export function Panel({ id }) {
  const t = theme();
  return v_flex()
    .id(id)
    .size_full()
    .min_h(0)
    .overflow_hidden()
    .bg(t.background)
    .text_color(t.foreground)
    .text_size(TEXT.body)
    .rounded(RADIUS.panel)
    .border_1()
    .border_color(t.border);
}

export function PanelHeader() {
  const t = theme();
  return h_flex()
    .h(SIZE.header)
    .flex_none()
    .px(12)
    .gap(6)
    .items_center()
    .border_b(1)
    .border_color(t.border);
}

export function Badge(text, accent = false) {
  const t = theme();
  return div()
    .flex_none()
    .px(5)
    .py(1)
    .rounded(RADIUS.small)
    .border_1()
    .border_color(accent ? t.accent : t.border)
    .text_size(TEXT.badge)
    .text_color(accent ? t.accent : t.muted)
    .child(String(text));
}

export function IconButton({
  id,
  icon,
  label,
  onClick,
  small = false,
  active = false,
  disabled = false,
  spinning = false,
}) {
  const t = theme();
  const size = small ? SIZE.iconSmall : SIZE.icon;
  return div()
    .id(id)
    .size(size)
    .flex_none()
    .flex()
    .items_center()
    .justify_center()
    .rounded(small ? RADIUS.small : RADIUS.control)
    .text_color(active ? t.accent : t.dim)
    .when(active, (el) => el.bg(t.selected))
    .accessibility_label(label)
    .tooltip(label)
    .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)))
    .when(disabled, (el) => el.opacity(0.45))
    .when(Boolean(onClick) && !disabled, (el) =>
      el.on_click((_e, cx) => {
        cx.stop_propagation();
        onClick(cx);
      }),
    )
    .child(spinning ? Icon(icon, small ? 12 : 14).spin(SPIN_MS) : Icon(icon, small ? 12 : 14));
}

export function TextButton({ id, icon, label, onClick, active = false, disabled = false, danger = false }) {
  const t = theme();
  return h_flex()
    .id(id)
    .h(SIZE.iconSmall)
    .flex_none()
    .px(6)
    .gap(4)
    .items_center()
    .rounded(RADIUS.small)
    .text_size(TEXT.caption)
    .text_color(danger ? t.ansi1 : active ? t.foreground : t.dim)
    .when(active, (el) => el.bg(t.selected))
    .when(disabled, (el) => el.opacity(0.45))
    .when(!disabled, (el) =>
      el
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(danger ? t.ansi1 : t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          onClick(cx);
        }),
    )
    .when(Boolean(icon), (el) => el.child(Icon(icon, 12)))
    .child(label);
}

export function ActionButton({
  id,
  icon,
  label,
  onClick,
  primary = true,
  enabled = true,
  spinning = false,
}) {
  const t = theme();
  const solid = enabled && primary;
  return h_flex()
    .id(id)
    .h(SIZE.button)
    .px(12)
    .gap(6)
    .items_center()
    .justify_center()
    .rounded(RADIUS.button)
    .bg(solid ? t.solid : t.raised)
    .border_1()
    .border_color(solid ? t.solid : t.border)
    .text_size(TEXT.small)
    .font_medium()
    .text_color(solid ? t.solid_foreground : enabled ? t.foreground : t.dim)
    .accessibility_label(label)
    .when(enabled, (el) =>
      el
        .cursor_pointer()
        .hover((s) => (solid ? s.opacity(0.88) : s.bg(t.hover)))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          onClick(cx);
        }),
    )
    .when(Boolean(icon), (el) =>
      el.child(spinning ? Icon(icon, 14).spin(SPIN_MS) : Icon(icon, 14)),
    )
    .child(label);
}

export function DropdownTrigger({ id, label, prefix, fullWidth = true }) {
  const t = theme();
  return h_flex()
    .id(id)
    .h(SIZE.row)
    .when(fullWidth, (el) => el.w_full())
    .px(8)
    .gap(5)
    .items_center()
    .rounded(RADIUS.control)
    .border_1()
    .border_color(t.border)
    .bg(t.raised)
    .text_size(TEXT.small)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .when(Boolean(prefix), (el) => el.child(div().flex_none().text_color(t.dim).child(prefix)))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(label))
    .child(Icon("chevron-down", 12).text_color(t.dim));
}

export function Menu({
  id,
  open,
  onOpenChange,
  focus,
  trigger,
  children,
  width = 210,
  anchor = "top_left",
}) {
  const t = theme();
  const body = v_flex()
    .id(`${id}-body`)
    .w(width)
    .p(5)
    .gap(1)
    .rounded(RADIUS.row)
    .border_1()
    .border_color(t.border)
    .bg(t.popover)
    .text_color(t.foreground)
    .track_focus(focus)
    .on_key_down((event, cx) => {
      if (event.key !== "escape") return;
      cx.stop_propagation();
      onOpenChange(false, cx);
    })
    .children(children);
  return Popover.new(id)
    .open(open)
    .anchor(anchor)
    .track_focus(focus)
    .on_open_change((value, cx) => onOpenChange(value, cx))
    .trigger(trigger)
    .when(open, (el) => el.content(body));
}

export function MenuLabel(text) {
  const t = theme();
  return div()
    .px(8)
    .pt(5)
    .pb(3)
    .text_size(TEXT.caption)
    .font_medium()
    .text_color(t.dim)
    .child(text);
}

export function MenuOption({ id, label, detail, selected, onClick }) {
  const t = theme();
  return h_flex()
    .id(id)
    .min_h(SIZE.menu)
    .flex_none()
    .px(8)
    .py(4)
    .gap(8)
    .items_center()
    .rounded(RADIUS.row)
    .cursor_pointer()
    .text_size(TEXT.menu)
    .role("menu_item_radio")
    .aria_selected(Boolean(selected))
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => onClick(cx))
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .child(div().truncate().text_color(t.foreground).child(label))
        .when(Boolean(detail), (el) =>
          el.child(div().truncate().text_size(TEXT.caption).text_color(t.dim).child(detail)),
        ),
    )
    .when(selected, (el) => el.child(Icon("check", 14).text_color(t.accent)));
}

export function TextBox({ id, state, focused, label, height = 96, onKeyDown }) {
  const t = theme();
  const box = Textarea.new(state)
    .id(id)
    .w_full()
    .h(height)
    .px(10)
    .py(7)
    .rounded(RADIUS.button)
    .border_1()
    .border_color(focused ? t.accent : t.border)
    .text_size(TEXT.small)
    .text_color(t.foreground)
    .accessibility_label(label);
  return onKeyDown ? box.on_key_down(onKeyDown) : box;
}

export function Message(text, error = false) {
  const t = theme();
  return div()
    .flex_none()
    .px(8)
    .py(6)
    .rounded(RADIUS.control)
    .bg(error ? t.raised : t.background)
    .border_1()
    .border_color(error ? t.ansi1 : t.border)
    .text_size(TEXT.small)
    .whitespace_normal()
    .text_color(error ? t.ansi1 : t.dim)
    .child(text);
}
