// ===========================================================================
// LectureContent — the canonical renderer for the Med Hub lecture format.
//
// ONE renderer is shared by the student view (LectureView) and the admin editor
// preview (LectureEditor), so what an author sees is exactly what students get.
//
// Pipeline: react-markdown
//   remark-gfm   -> tables, task lists, strikethrough, autolinks
//   remark-math  -> $inline$ and $$block$$ math (with rehype-katex)
//   rehype-raw   -> lets raw/custom HTML tags through to be mapped to components
//   rehype-katex -> renders the math to KaTeX
//
// Supported blocks (the strict format):
//   #/##/###/####  headings · - / 1.  lists · - [ ] / - [x] task lists
//   > quote · ---  divider · ```lang code · $$ math $$
//   ![caption](url) image · <table><tr><td> tables
//   <details><summary> toggle · <callout> callout · <columns><column> columns
//   <video src> <audio src> <pdf src> <file src> media (with caption children)
//
// NOTE: content is admin-authored (RLS-gated), so raw HTML is intentionally
// allowed (rehype-raw). If untrusted authoring is ever added, insert
// rehype-sanitize with a schema that whitelists these custom tags.
// ===========================================================================
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import { Info, FileDown } from "lucide-react";
import "katex/dist/katex.min.css";

const components = {
  a: ({ node, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" />,

  img: ({ node, alt, ...p }) => (
    <img {...p} alt={alt || ""} loading="lazy" className="rounded-xl border border-gray-200/80 shadow-sm dark:border-white/10" />
  ),

  // Callout — Kenhub-style notice: light tint + left border + icon.
  callout: ({ children }) => (
    <div className="my-5 flex gap-3 rounded-xl border-l-4 border-med-primary bg-med-primary/5 px-4 py-3">
      <Info className="mt-0.5 h-5 w-5 flex-none text-med-primary" aria-hidden="true" />
      <div className="min-w-0 [&>:first-child]:mt-0 [&>:last-child]:mb-0">{children}</div>
    </div>
  ),

  // Toggle (native details/summary), styled.
  details: ({ node, ...p }) => (
    <details className="group my-4 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/10" {...p} />
  ),
  summary: ({ node, ...p }) => (
    <summary className="cursor-pointer select-none font-medium text-gray-900 marker:text-med-primary" {...p} />
  ),

  // Columns layout.
  columns: ({ children }) => <div className="my-5 grid gap-5 sm:grid-cols-2">{children}</div>,
  column: ({ children }) => <div className="min-w-0 [&>:first-child]:mt-0">{children}</div>,

  // Media blocks (caption = children).
  video: ({ src, children }) => (
    <figure className="my-5">
      <video src={src} controls className="w-full rounded-xl border border-gray-200/80 bg-black" />
      {children ? <figcaption className="mt-2 text-center text-sm text-gray-500">{children}</figcaption> : null}
    </figure>
  ),
  audio: ({ src, children }) => (
    <figure className="my-4">
      <audio src={src} controls className="w-full" />
      {children ? <figcaption className="mt-1 text-sm text-gray-500">{children}</figcaption> : null}
    </figure>
  ),
  pdf: ({ src, children }) => (
    <figure className="my-5">
      <iframe src={src} title={typeof children === "string" ? children : "PDF document"} className="h-[75vh] w-full rounded-xl border border-gray-200/80" />
      {children ? <figcaption className="mt-2 text-sm text-gray-500">{children}</figcaption> : null}
    </figure>
  ),
  file: ({ src, children }) => (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="my-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-med-primary no-underline shadow-sm hover:bg-med-primary/5 transition-colors"
    >
      <FileDown className="h-4 w-4" aria-hidden="true" /> {children || "Download file"}
    </a>
  ),

  // Tables — premium on-brand styling; the wrapper scrolls horizontally on
  // narrow screens so wide tables never overflow the mobile layout. Header
  // row is tinted from the #1B98E0 primary; dark body sits on the canonical
  // #0e172a canvas.
  table: ({ node, ...p }) => (
    <div className="my-5 overflow-x-auto rounded-xl border border-gray-200/80 shadow-sm dark:border-white/10 dark:bg-[#0e172a]">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  th: ({ node, ...p }) => <th className="border-b-2 border-[#1B98E0]/30 bg-[#1B98E0]/10 px-4 py-2.5 text-left font-semibold text-gray-800 dark:border-[#1B98E0]/40 dark:bg-[#1B98E0]/15 dark:text-slate-100" {...p} />,
  td: ({ node, ...p }) => <td className="border-b border-gray-100 px-4 py-2.5 align-top text-gray-700 dark:border-white/10 dark:text-slate-300" {...p} />,
};

export default function LectureContent({ markdown }) {
  return (
    <div className="prose prose-blue max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-med-primary prose-img:my-4 prose-pre:bg-gray-900 prose-pre:text-gray-100">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={components}
      >
        {markdown || ""}
      </ReactMarkdown>
    </div>
  );
}
