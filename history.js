// history.js: Persistent JSON history store for Rewrite (capped at maxItems).
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";

const HISTORY_FILE = "history.json";
const DEFAULT_MAX_ITEMS = 20;
const DEFAULT_MAX_CONTEXT_CHARS = 20000;

export function createHistoryEntry({
  rewriteType,
  outputType,
  harness,
  model,
  context = "",
  input,
  output,
  maxContextChars = DEFAULT_MAX_CONTEXT_CHARS,
}) {
  const ctx = String(context ?? "");
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    rewriteType,
    outputType,
    harness,
    model,
    context: ctx.length > maxContextChars ? ctx.slice(0, maxContextChars) : ctx,
    input: String(input ?? ""),
    output: String(output ?? ""),
  };
}

export function addHistoryEntry(list, entry, maxItems = DEFAULT_MAX_ITEMS) {
  const limit = Math.max(1, Number(maxItems) || DEFAULT_MAX_ITEMS);
  return [entry, ...(Array.isArray(list) ? list : [])].slice(0, limit);
}

export function removeHistoryEntry(list, id) {
  return (Array.isArray(list) ? list : []).filter((item) => item.id !== id);
}

export function previewText(text, maxLen = 72) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= maxLen) return flat;
  return `${flat.slice(0, maxLen - 1).trimEnd()}…`;
}

export function formatRelativeTime(isoString, now = Date.now()) {
  const ts = Date.parse(isoString);
  if (!Number.isFinite(ts)) return "";
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export async function loadHistory(dir, maxItems = DEFAULT_MAX_ITEMS) {
  const limit = Math.max(1, Number(maxItems) || DEFAULT_MAX_ITEMS);
  try {
    const raw = await readFile(join(dir, HISTORY_FILE), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, limit) : [];
  } catch {
    return [];
  }
}

export async function saveHistory(dir, items) {
  await mkdir(dir, { recursive: true });
  const target = join(dir, HISTORY_FILE);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(items, null, 2), "utf8");
  await rename(tmp, target);
}
