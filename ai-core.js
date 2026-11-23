// ai-core.js: Pure harness definitions, selection order, and output sanitization.

export const HARNESSES = {
  claude: {
    label: "Claude Code",
    shortLabel: "Claude",
    detail: "Claude Code",
    command: "claude",
    keys: ["claude", "claude-code"],
    args: ({ model, effort, text }) => [
      "-p",
      "--tools",
      "",
      "--no-session-persistence",
      "--setting-sources",
      "",
      "--output-format",
      "text",
      "--model",
      model,
      "--effort",
      effort,
      text,
    ],
  },
  antigravity: {
    label: "Antigravity",
    shortLabel: "Antigravity",
    detail: "agy CLI",
    command: "agy",
    keys: ["antigravity", "agy"],
    args: ({ model, effort, text }) => [
      "-p",
      text,
      "--model",
      /-(low|medium|high|xhigh)$/.test(model) ? model : `${model}-${effort}`,
      "--mode",
      "plan",
      "--output-format",
      "text",
    ],
  },
  copilot: {
    label: "Copilot",
    shortLabel: "Copilot",
    detail: "Copilot CLI",
    command: "copilot",
    keys: ["copilot"],
    args: ({ model, effort, text }) => [
      "-p",
      text,
      "-s",
      "--model",
      model,
      "--reasoning-effort",
      effort,
      "--no-ask-user",
      "--no-custom-instructions",
      "--disable-builtin-mcps",
      "--available-tools",
      "",
    ],
  },
  codex: {
    label: "Codex",
    shortLabel: "Codex",
    detail: "Codex CLI",
    command: "codex",
    keys: ["codex"],
    args: ({ model, effort, text }) => [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "-m",
      model,
      "-c",
      `model_reasoning_effort=${effort}`,
      text,
    ],
  },
  opencode: {
    label: "OpenCode",
    shortLabel: "OpenCode",
    detail: "OpenCode CLI",
    command: "opencode",
    keys: ["opencode"],
    needsFile: true,
    args: ({ model, effort, file }) => [
      "run",
      "-m",
      `${model}#${effort}`,
      "--agent",
      "plan",
      "-f",
      file,
      "Follow the instructions in the attached file and reply with the rewritten text only.",
    ],
  },
};

export const HARNESS_ORDER = ["claude", "antigravity", "copilot", "codex", "opencode"];

export function harnessOrder(configured, tabPanes = []) {
  const seen = [];
  const add = (id) => id && HARNESSES[id] && !seen.includes(id) && seen.push(id);
  if (configured && configured !== "auto") {
    add(configured);
    return seen;
  }
  const inTab = [...tabPanes].sort((a, b) => Number(b.focused) - Number(a.focused));
  for (const pane of inTab) {
    const key = pane.program?.key ?? pane.app;
    add(HARNESS_ORDER.find((id) => HARNESSES[id].keys.includes(key) || HARNESSES[id].keys.includes(pane.app)));
  }
  for (const id of HARNESS_ORDER) add(id);
  return seen;
}

export function cleanOutput(raw) {
  const text = String(raw ?? "")
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\r/g, "");
  const lines = text.split("\n");
  while (lines.length && (/^\s*$/.test(lines[0]) || /^>\s+\S+\s+·\s+/.test(lines[0]))) {
    lines.shift();
  }
  while (lines.length && /^\s*$/.test(lines[lines.length - 1])) {
    lines.pop();
  }
  if (lines.length >= 2 && /^\s*```[a-zA-Z0-9_-]*\s*$/.test(lines[0]) && /^\s*```\s*$/.test(lines[lines.length - 1])) {
    lines.shift();
    lines.pop();
  }
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
