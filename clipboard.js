// clipboard.js: Plain-text and Windows CF_HTML rich-text clipboard copy.
import { mkdir, writeFile } from "fs/promises";
import { platform } from "os";
import { exec, appHome } from "herdr";
import { markdownToHtml, markdownToPlainText, buildCfHtml } from "./format.js";

export async function copyFormatted(text, outputType, cx) {
  const value = String(text ?? "");
  if (!value.trim()) return { rich: false };

  if (outputType !== "outlook-rich" || platform() !== "win32") {
    cx.write_to_clipboard(value);
    return { rich: false };
  }

  const plain = markdownToPlainText(value);
  const cfHtml = buildCfHtml(markdownToHtml(value));

  try {
    const dir = `${appHome()}/data/rewrite`;
    await mkdir(dir, { recursive: true });
    const htmlPath = `${dir}/cf-html.txt`;
    const plainPath = `${dir}/plain.txt`;
    const scriptPath = `${appHome()}/mods/rewrite/copy-rich.ps1`;
    await Promise.all([
      writeFile(htmlPath, cfHtml, "utf8"),
      writeFile(plainPath, plain, "utf8"),
    ]);
    const res = await exec(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-File", scriptPath, htmlPath, plainPath],
      { cwd: dir, timeout: 10000 },
    );
    if (res.code !== 0) throw Error((res.stderr || res.stdout).trim() || `exit ${res.code}`);
    return { rich: true };
  } catch (error) {
    console.warn(`Outlook rich copy failed, falling back to plain text: ${error.message}`);
    cx.write_to_clipboard(plain || value);
    return { rich: false, fallback: true };
  }
}
