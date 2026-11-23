// settings-core.js: Pure duration parsing and settings deep-merge helpers.
import { HARNESS_ORDER } from "./ai-core.js";

const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 };
const VALID_HARNESSES = new Set(["auto", ...HARNESS_ORDER]);
const VALID_EFFORTS = new Set(["low", "medium", "high"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function duration(value, fallback) {
  if (typeof value === "number") return value > 0 ? value : fallback;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h)\s*$/.exec(String(value ?? ""));
  return (match && Math.round(Number(match[1]) * UNITS[match[2]])) || fallback;
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function mergeSettings(defaults, given, problems = [], path = "") {
  const result = { ...defaults };
  if (!isObject(given)) {
    if (given !== undefined) problems.push(`${path || "settings"} must be an object`);
    return result;
  }
  for (const [key, value] of Object.entries(given)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const name = path ? `${path}.${key}` : key;
    if (path === "rewrite_types") {
      if (isObject(value) && typeof value.label === "string" && value.label.trim() && typeof value.prompt === "string" && value.prompt.trim()) {
        result[key] = { label: value.label.trim(), prompt: value.prompt.trim() };
      } else {
        problems.push(`${name} must have non-empty string label and prompt`);
      }
      continue;
    }
    if (!Object.hasOwn(defaults, key)) {
      problems.push(`${name} is not a setting`);
      continue;
    }
    const current = defaults[key];
    if (isObject(current)) {
      result[key] = mergeSettings(current, value, problems, name);
    } else if (typeof value === typeof current || (typeof current === "string" && typeof value === "number")) {
      if (name === "ai.harness" && !VALID_HARNESSES.has(value)) {
        problems.push(`${name} must be one of ${[...VALID_HARNESSES].join(", ")}`);
      } else if (name === "ai.effort" && !VALID_EFFORTS.has(value)) {
        problems.push(`${name} must be one of ${[...VALID_EFFORTS].join(", ")}`);
      } else if (name === "history.max_items") {
        const n = Number(value);
        result[key] = Number.isFinite(n) ? Math.min(100, Math.max(1, Math.floor(n))) : 20;
      } else if (name === "ai.max_input_chars") {
        const n = Number(value);
        result[key] = Number.isFinite(n) ? Math.min(28000, Math.max(1000, Math.floor(n))) : 24000;
      } else {
        result[key] = value;
      }
    } else {
      problems.push(`${name} should be a ${typeof current}`);
    }
  }
  return result;
}
