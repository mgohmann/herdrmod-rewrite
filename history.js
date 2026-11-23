// history.js: Persistent JSON history store for Rewrite (capped at 1..100 items).
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const HISTORY_FILE = "history.json";
const DEFAULT_MAX_ITEMS = 20;
const MAX_ITEMS_LIMIT = 100;
const DEFAULT_MAX_CONTEXT_CHARS = 20000;

let writeChain = Promise.resolve();

export function clampMaxItems(maxItems = DEFAULT_MAX_ITEMS) {
  const n = Number(maxItems);
  if (!Number.isFinite(n)) return DEFAULT_MAX_ITEMS;
  return Math.min(MAX_ITEMS_LIMIT, Math.max(1, Math.floor(n)));
}

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
    rewriteType: String(rewriteType ?? "default"),
    outputType: String(outputType ?? "markdown"),
    harness: String(harness ?? ""),
    model: String(model ?? ""),
    context: ctx.length > maxContextChars ? ctx.slice(0, maxContextChars) : ctx,
    input: String(input ?? ""),
    output: String(output ?? ""),
  };
}

export function addHistoryEntry(list, entry, maxItems = DEFAULT_MAX_ITEMS) {
  const limit = clampMaxItems(maxItems);
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

export async function loadHistory(dir, maxItems = DEFAULT_MAX_ITEMS, io = null) {
  const limit = clampMaxItems(maxItems);
  const path = join(dir, HISTORY_FILE);
  try {
    const raw = io?.readText ? await io.readText(path) : await readFile(path, "utf8");
    if (raw === null || raw === undefined) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seenIds = new Set();
    const valid = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.output !== "string") {
        continue;
      }
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      valid.push({
        id: item.id,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
        rewriteType: typeof item.rewriteType === "string" ? item.rewriteType : "default",
        outputType: typeof item.outputType === "string" ? item.outputType : "markdown",
        harness: typeof item.harness === "string" ? item.harness : "",
        model: typeof item.model === "string" ? item.model : "",
        context: typeof item.context === "string" ? item.context : "",
        input: typeof item.input === "string" ? item.input : "",
        output: item.output,
      });
      if (valid.length >= limit) break;
    }
    return valid;
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.warn(`Could not load rewrite history: ${err?.message ?? err}`);
    }
    return [];
  }
}

export function saveHistory(dir, items, io = null) {
  const payload = JSON.stringify(items, null, 2);
  const path = join(dir, HISTORY_FILE);
  const next = writeChain
    .catch(() => {})
    .then(async () => {
      await mkdir(dir, { recursive: true });
      if (io?.readText && io?.writeText) {
        const expected = await io.readText(path).catch(() => null);
        await io.writeText(path, payload, expected);
      } else {
        await writeFile(path, payload, "utf8");
      }
    });
  writeChain = next;
  return next;
}
