// ai.js: Multi-harness non-interactive CLI runner for Rewrite.
// Runs once in a neutral folder (appHome()/data/rewrite) with tools disabled so
// the coding agent never inspects or modifies any repository.
import { mkdir, unlink } from "fs/promises";
import { exec, panes, spaces, appHome, writeTextFile } from "herdr";
import { duration } from "./settings-core.js";
import { HARNESSES, HARNESS_ORDER, harnessOrder, cleanOutput } from "./ai-core.js";

export { HARNESSES, HARNESS_ORDER, harnessOrder, cleanOutput };

async function dataDir() {
  const dir = `${appHome()}/data/rewrite`;
  await mkdir(dir, { recursive: true }).catch(() => {});
  return dir;
}

async function writePromptFile(dir, text) {
  const path = `${dir}/prompt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`;
  await writeTextFile(path, text, null);
  return path;
}

export async function runRewritePrompt({ prompt, harnessSetting = "auto", aiSettings = {} }) {
  const dir = await dataDir();
  const space = spaces().find((s) => s.active);
  const tab = space?.tabs?.find((t) => t.active)?.id;
  const tabPanes = panes().filter((p) => p.tab === tab && p.terminal);
  const order = harnessOrder(harnessSetting, tabPanes);
  if (!order.length) throw Error(`Unknown AI harness: ${harnessSetting}`);

  const timeout = Math.min(600000, duration(aiSettings.timeout, 90000));
  const effort = aiSettings.effort || "low";

  let file = null;
  let lastError = "";
  try {
    for (const id of order) {
      const harness = HARNESSES[id];
      const model = aiSettings[`${id}_model`] ?? "";
      let result;
      try {
        if (harness.needsFile && !file) file = await writePromptFile(dir, prompt);
        result = await exec(
          harness.command,
          harness.args({ model, effort, text: prompt, file }),
          { cwd: dir, timeout },
        );
      } catch (error) {
        lastError = `${harness.label} could not start (${error.message}).`;
        if (harnessSetting !== "auto") break;
        continue;
      }

      const cleaned = cleanOutput(result.stdout);
      if (result.code === 0 && cleaned) {
        return { text: cleaned, harness: id, label: harness.label, model };
      }
      const detail = (result.stderr || result.stdout).trim().split("\n")[0] || `exit ${result.code}`;
      lastError = `${harness.label} failed: ${detail}`;
      if (harnessSetting !== "auto") break;
    }
  } finally {
    if (file) await unlink(file).catch(() => {});
  }

  throw Error(lastError || "No coding agent answered.");
}
