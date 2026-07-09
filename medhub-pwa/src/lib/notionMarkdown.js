// ===========================================================================
// notionMarkdown.js — convert pasted rich-text HTML (Notion, Google Docs, …)
// into CLEAN Markdown for the Admin lecture editor.
//
// Notion's clipboard HTML is noisy: nested <span>s, inline styles, data-*
// attributes, &nbsp;, and empty nodes. We pre-clean the DOM, then run Turndown
// (+ the GFM plugin for tables / strikethrough / task lists), then tidy the
// output (collapse blank lines, drop trailing spaces).
//
// IMAGES: Notion <img> srcs are temporary, auth-protected URLs
// (prod-files.notion-static.com/…) that rot once the clipboard/session expires.
// Our images belong in Supabase Storage, not Notion links — so we DROP the src
// and leave a visible "[image — upload manually]" marker instead of embedding a
// link that will 404 later.
// ===========================================================================
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const NBSP = / /g;

const td = new TurndownService({
  headingStyle: "atx",          // ## Heading  (matches the editor's H2 snippet)
  bulletListMarker: "-",        // - bullets   (matches the List/To-do snippets)
  codeBlockStyle: "fenced",     // ```lang fences
  fence: "```",
  emDelimiter: "*",
  strongDelimiter: "**",
  hr: "---",
  linkStyle: "inlined",
});

// GFM: tables, strikethrough, and task lists (- [ ] / - [x] for Notion to-dos).
td.use(gfm);

// Images → manual-upload marker (never embed a doomed Notion URL).
td.addRule("notionImages", {
  filter: "img",
  replacement: (_content, node) => {
    const alt = (node.getAttribute("alt") || "").trim();
    return alt ? `[image — upload manually: ${alt}]` : "[image — upload manually]";
  },
});

// Pre-clean the pasted HTML in a detached DOM before Turndown sees it.
function cleanHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // 1) Strip presentational / Notion-specific attributes that add no meaning.
  doc.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("style");
    el.removeAttribute("class");
    [...el.attributes].forEach((a) => {
      if (a.name.startsWith("data-") || a.name.startsWith("aria-")) el.removeAttribute(a.name);
    });
  });

  // 2) Remove empty inline wrappers (Notion emits lots of <span></span>) so we
  //    don't get stray spaces/entities. Keep anything that holds an image.
  doc.querySelectorAll("span, a, b, i, strong, em, u, mark, font").forEach((el) => {
    if (!el.textContent.trim() && !el.querySelector("img")) el.remove();
  });

  // 3) Normalize non-breaking spaces to regular spaces.
  return doc.body.innerHTML.replace(NBSP, " ");
}

// Tidy Turndown's output.
function tidyMarkdown(md) {
  return md
    .replace(NBSP, " ")             // any surviving &nbsp;
    .replace(/[ \t]+$/gm, "")       // trailing whitespace per line
    .replace(/\n{3,}/g, "\n\n")     // collapse 3+ blank lines → one blank line
    .trim();
}

// Public: HTML string → clean Markdown. Returns "" on empty/failed input so the
// caller can fall back to the browser's default paste.
export function htmlToMarkdown(html) {
  if (!html || !html.trim()) return "";
  try {
    return tidyMarkdown(td.turndown(cleanHtml(html)));
  } catch {
    return "";
  }
}
