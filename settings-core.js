// settings-core.js: Pure duration parsing and settings deep-merge helpers.

const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 };

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
    const name = path ? `${path}.${key}` : key;
    if (path === "rewrite_types") {
      if (isObject(value) && typeof value.label === "string" && typeof value.prompt === "string") {
        result[key] = { label: value.label, prompt: value.prompt };
      } else {
        problems.push(`${name} must have string label and prompt`);
      }
      continue;
    }
    if (!(key in defaults)) {
      problems.push(`${name} is not a setting`);
      continue;
    }
    const current = defaults[key];
    if (isObject(current)) result[key] = mergeSettings(current, value, problems, name);
    else if (typeof value === typeof current || (typeof current === "string" && typeof value === "number"))
      result[key] = value;
    else problems.push(`${name} should be a ${typeof current}`);
  }
  return result;
}
