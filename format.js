// format.js: Pure Markdown -> Outlook-safe HTML, plain text, and CF_HTML formatting.

const ESCAPE_HTML = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (ch) => ESCAPE_HTML[ch]);
}

function renderInline(text) {
  let out = escapeHtml(text);
  const codeSpans = [];
  out = out.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = codeSpans.length;
    codeSpans.push(
      `<code style="font-family:Consolas,monospace;font-size:10pt;background:#f3f4f6;padding:1px 4px;border-radius:3px;">${code}</code>`,
    );
    return `\x00CODE${idx}\x00`;
  });

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
    if (!/^(https?:|mailto:)/i.test(url)) return label;
    return `<a href="${url}" style="color:#0f6cbd;text-decoration:underline;">${label}</a>`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^\w*])\*([^*]+)\*(?=[^\w*]|$)/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^\w_])_([^_]+)_(?=[^\w_]|$)/g, "$1<em>$2</em>");

  return out.replace(/\x00CODE(\d+)\x00/g, (_m, i) => codeSpans[Number(i)]);
}

function formatBullet(raw) {
  const task = /^\[( |x|X)\]\s+(.*)$/.exec(raw);
  return task
    ? `${task[1].toLowerCase() === "x" ? "☑" : "☐"} ${renderInline(task[2])}`
    : renderInline(raw);
}

export function markdownToHtml(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let inCode = false;
  let codeLines = [];
  let listType = null; // "ul" | "ol"
  let nestedUlOpen = false;
  let liOpen = false;
  let para = [];
  let quoteLines = [];

  const flushPara = () => {
    if (!para.length) return;
    html.push(`<p style="margin:0 0 8px 0;">${para.map(renderInline).join("<br>")}</p>`);
    para = [];
  };

  const flushQuote = () => {
    if (!quoteLines.length) return;
    html.push(
      `<blockquote style="margin:0 0 8px 0;padding:4px 10px;border-left:3px solid #d1d5db;color:#4b5563;">${quoteLines.map(renderInline).join("<br>")}</blockquote>`,
    );
    quoteLines = [];
  };

  const closeNested = () => {
    if (nestedUlOpen) {
      html.push("</ul>");
      nestedUlOpen = false;
    }
    if (liOpen) {
      html.push("</li>");
      liOpen = false;
    }
  };

  const closeList = () => {
    closeNested();
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushPara();
      flushQuote();
      closeList();
      if (inCode) {
        html.push(
          `<pre style="font-family:Consolas,monospace;font-size:10pt;background:#f3f4f6;padding:8px 10px;border-radius:4px;margin:0 0 8px 0;white-space:pre-wrap;">${escapeHtml(codeLines.join("\n"))}</pre>`,
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushPara();
      flushQuote();
      closeList();
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushPara();
      closeList();
      quoteLines.push(quote[1]);
      continue;
    }
    flushQuote();

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushPara();
      closeList();
      html.push('<hr style="border:none;border-top:1px solid #d1d5db;margin:10px 0;">');
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushPara();
      closeList();
      const level = Math.min(4, heading[1].length);
      const sizes = { 1: "15pt", 2: "13pt", 3: "11.5pt", 4: "11pt" };
      html.push(
        `<h${level} style="margin:10px 0 4px 0;font-size:${sizes[level]};font-weight:600;">${renderInline(heading[2].trim())}</h${level}>`,
      );
      continue;
    }

    const ul = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (ul) {
      flushPara();
      const indented = ul[1].length >= 2;
      if (indented && (listType === "ul" || listType === "ol") && liOpen) {
        if (!nestedUlOpen) {
          html.push('<ul style="margin:2px 0 2px 0;padding-left:18px;">');
          nestedUlOpen = true;
        }
        html.push(`<li style="margin:2px 0;">${formatBullet(ul[2])}</li>`);
        continue;
      }
      closeNested();
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push('<ul style="margin:0 0 8px 0;padding-left:20px;">');
      }
      html.push(`<li style="margin:2px 0;">${formatBullet(ul[2])}`);
      liOpen = true;
      continue;
    }

    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      flushPara();
      closeNested();
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push('<ol style="margin:0 0 8px 0;padding-left:20px;">');
      }
      html.push(`<li style="margin:2px 0;">${renderInline(ol[1])}`);
      liOpen = true;
      continue;
    }

    closeList();
    para.push(line);
  }

  if (inCode && codeLines.length) {
    html.push(
      `<pre style="font-family:Consolas,monospace;font-size:10pt;background:#f3f4f6;padding:8px 10px;border-radius:4px;margin:0 0 8px 0;white-space:pre-wrap;">${escapeHtml(codeLines.join("\n"))}</pre>`,
    );
  }
  flushPara();
  flushQuote();
  closeList();

  return `<div style="font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.45;">${html.join("")}</div>`;
}

export function markdownToPlainText(markdown) {
  return String(markdown ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*```[a-zA-Z0-9_-]*\s*$/gm, "")
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^(\s*)[*+]\s+/gm, "$1- ")
    .replace(/^(\s*-\s+)\[( |x|X)\]\s+/gm, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^\w*])\*([^*]+)\*(?=[^\w*]|$)/g, "$1$2")
    .replace(/(^|[^\w_])_([^_]+)_(?=[^\w_]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Pure UTF-8 byte counter (no TextEncoder dependency for QuickJS compatibility).
export function utf8Length(str) {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

const pad10 = (n) => String(n).padStart(10, "0");

// Builds a Windows CF_HTML clipboard payload with exact UTF-8 byte offsets.
export function buildCfHtml(fragmentHtml) {
  const prefix = "<html>\r\n<body>\r\n<!--StartFragment-->";
  const suffix = "<!--EndFragment-->\r\n</body>\r\n</html>";
  const headerTemplate =
    "Version:0.9\r\n" +
    "StartHTML:0000000000\r\n" +
    "EndHTML:0000000000\r\n" +
    "StartFragment:0000000000\r\n" +
    "EndFragment:0000000000\r\n";

  const startHtml = utf8Length(headerTemplate);
  const startFragment = startHtml + utf8Length(prefix);
  const endFragment = startFragment + utf8Length(fragmentHtml);
  const endHtml = endFragment + utf8Length(suffix);

  const header =
    `Version:0.9\r\n` +
    `StartHTML:${pad10(startHtml)}\r\n` +
    `EndHTML:${pad10(endHtml)}\r\n` +
    `StartFragment:${pad10(startFragment)}\r\n` +
    `EndFragment:${pad10(endFragment)}\r\n`;

  return `${header}${prefix}${fragmentHtml}${suffix}`;
}
