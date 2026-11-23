// clipboard.js: Plain-text and Windows CF_HTML rich-text clipboard copy.
import { mkdir, unlink, writeFile } from "fs/promises";
import { platform } from "os";
import { exec, appHome } from "herdr";
import { markdownToHtml, markdownToPlainText, buildCfHtml } from "./format.js";

function writePlain(cx, text) {
  cx.write_to_clipboard(text);
}

export async function copyFormatted(text, outputType, cx) {
  const value = String(text ?? "");
  if (!value.trim()) return { rich: false, fallback: false };

  if (outputType !== "outlook-rich") {
    writePlain(cx, value);
    return { rich: false, fallback: false };
  }

  const plain = markdownToPlainText(value) || value;
  if (platform() !== "win32") {
    writePlain(cx, plain);
    return { rich: false, fallback: true };
  }

  const dir = `${appHome()}/data/rewrite`;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const htmlPath = `${dir}/cf-html-${stamp}.txt`;
  const plainPath = `${dir}/plain-${stamp}.txt`;
  const scriptPath = `${appHome()}/mods/rewrite/copy-rich.ps1`;

  try {
    const cfHtml = buildCfHtml(markdownToHtml(value));
    await mkdir(dir, { recursive: true });
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
    return { rich: true, fallback: false };
  } catch (error) {
    console.warn(`Outlook rich copy failed, falling back to plain text: ${error.message}`);
    writePlain(cx, plain);
    return { rich: false, fallback: true };
  } finally {
    await Promise.all([
      unlink(htmlPath).catch(() => {}),
      unlink(plainPath).catch(() => {}),
    ]);
  }
}
