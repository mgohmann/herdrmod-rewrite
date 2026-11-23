// settings.js: Loads mod.json settings merged over defaults.
import { readTextFile, appHome } from "herdr";
import { duration, mergeSettings } from "./settings-core.js";

export { duration, mergeSettings };

export async function loadSettings(name, defaults) {
  const problems = [];
  let given = {};
  try {
    const raw = await readTextFile(`${appHome()}/mods/${name}/mod.json`);
    given = JSON.parse(raw ?? "{}").settings ?? {};
  } catch (e) {
    problems.push(`mod.json could not be read: ${e.message}`);
  }
  return { settings: mergeSettings(defaults, given, problems), problems };
}
