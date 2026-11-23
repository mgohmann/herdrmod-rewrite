// prompts.js: Built-in Rewrite Types, Output Types, and minimal-context prompt builder.

export const REWRITE_TYPES = {
  default: {
    id: "default",
    label: "Default",
    summary: "Grammar, spelling & clarity",
    prompt: [
      "Rewrite the input to fix grammar, spelling, punctuation, and flow.",
      "Improve paragraph structure and use bullet points where they make the text easier to scan.",
      "Preserve the original voice, facts, and meaning without adding new claims.",
    ].join(" "),
  },
  professionalize: {
    id: "professionalize",
    label: "Professionalize",
    summary: "Polished email/Teams/doc tone",
    prompt: [
      "Rewrite the input in a clear, accurate, polished tone suitable for a professional email, Microsoft Teams message, or business document.",
      "Clarify or expand ambiguous acronyms or shorthand where helpful for the reader, and keep the message direct, respectful, and well-structured.",
    ].join(" "),
  },
  "answer-questions": {
    id: "answer-questions",
    label: "Answer Questions",
    summary: "Pair dictated answers to questions",
    prompt: [
      "The input contains rough or voice-dictated answers to one or more questions (check Context for the questions list if provided, otherwise infer the questions from the input).",
      "Structure and format the response so each answer cleanly pairs with its corresponding question.",
      "If a point relevant to an earlier or different question was mentioned out of order, move or consolidate it under the right question.",
      "Keep the user's actual answers, facts, and intent completely intact without inventing new answers.",
    ].join(" "),
  },
};

export const OUTPUT_TYPES = {
  markdown: {
    id: "markdown",
    label: "Markdown",
    summary: "Standard Markdown",
    prompt: "Format the output as clean GitHub-flavored Markdown (headings, bold, and bullet lists where appropriate).",
  },
  "plain-text": {
    id: "plain-text",
    label: "Plain Text",
    summary: "Clean text, no Markdown",
    prompt: "Format as clean plain text with zero Markdown syntax (no **, #, or backticks). Use blank lines and simple '-' bullets only if needed.",
  },
  "obsidian-checklist": {
    id: "obsidian-checklist",
    label: "Obsidian Checklist",
    summary: "Markdown tasks (- [ ])",
    prompt: "Format as an Obsidian-compatible Markdown checklist using '- [ ] ' task items, grouped under brief headings or nested bullets where helpful.",
  },
  "outlook-plain": {
    id: "outlook-plain",
    label: "Outlook Plain Text",
    summary: "Email-ready plain text",
    prompt: "Format as clean email-ready plain text for Microsoft Outlook: short scannable paragraphs, clean indented bullets if needed, and zero raw Markdown symbols (no **, #, or backticks).",
  },
  "outlook-rich": {
    id: "outlook-rich",
    label: "Outlook Rich Text",
    summary: "Copies rich HTML for Outlook",
    prompt: "Format using clean standard Markdown (headings, bold, bullet/numbered lists, links) so it converts cleanly to rich HTML for Outlook.",
  },
};

export function resolveRewriteType(id, customTypes = {}) {
  if (customTypes && Object.hasOwn(customTypes, id)) {
    return {
      id,
      label: customTypes[id].label || id,
      summary: "Custom prompt",
      prompt: customTypes[id].prompt,
    };
  }
  return Object.hasOwn(REWRITE_TYPES, id) ? REWRITE_TYPES[id] : REWRITE_TYPES.default;
}

export function resolveOutputType(id) {
  return Object.hasOwn(OUTPUT_TYPES, id) ? OUTPUT_TYPES[id] : OUTPUT_TYPES.markdown;
}

export function buildPrompt({ rewriteType, outputType, context = "", input, customRewriteTypes = {} }) {
  const rw = resolveRewriteType(rewriteType, customRewriteTypes);
  const out = resolveOutputType(outputType);
  const trimmedContext = String(context ?? "").trim();
  const trimmedInput = String(input ?? "").trim();

  const parts = [
    "You are a focused text rewriting assistant.",
    "Reply with ONLY the rewritten text: no preamble, no quotes around the whole response, no meta-commentary.",
    "",
    `Rewrite goal (${rw.label}):`,
    rw.prompt,
    "",
    `Output format (${out.label}):`,
    out.prompt,
  ];

  if (trimmedContext) {
    parts.push("", "Context (reference only — do not rewrite this unless needed to structure the answer):", "---", trimmedContext, "---");
  }

  parts.push("", "Input to rewrite:", "---", trimmedInput, "---");

  return parts.join("\n");
}

// Builds a prompt bounded to `maxChars` by trimming context first, never the input.
export function buildBoundedPrompt({ rewriteType, outputType, context = "", input, customRewriteTypes = {}, maxChars = 24000 }) {
  const full = buildPrompt({ rewriteType, outputType, context, input, customRewriteTypes });
  if (full.length <= maxChars) return { prompt: full, contextTruncated: false };

  const baseWithoutContext = buildPrompt({ rewriteType, outputType, context: "", input, customRewriteTypes });
  if (baseWithoutContext.length > maxChars) {
    throw Error(`Input exceeds the ${maxChars.toLocaleString()} character prompt limit (${baseWithoutContext.length.toLocaleString()} chars).`);
  }

  const trimmedContext = String(context ?? "").trim();
  const overhead = full.length - trimmedContext.length;
  const budget = Math.max(0, maxChars - overhead - 20);
  const clippedContext = budget > 0 ? `${trimmedContext.slice(0, budget).trimEnd()}\n[...truncated]` : "";
  return {
    prompt: buildPrompt({ rewriteType, outputType, context: clippedContext, input, customRewriteTypes }),
    contextTruncated: true,
  };
}
