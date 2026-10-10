import Markdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { normalizeMathText } from "@local-learning-studio/contracts";

const mathMacros = {
  "\\ket": "\\left|#1\\right\\rangle",
  "\\bra": "\\left\\langle#1\\right|",
  "\\braket": "\\left\\langle#1\\middle|#2\\right\\rangle",
  "\\expect": "\\left\\langle#1\\right\\rangle",
};

const inertImportedMarkdownComponents: Components = {
  a: ({ children }) => <span>{children}</span>,
  img: ({ alt }) => <span>{alt}</span>,
};

export function MarkdownMath({ content, className, inline = false, inertLinksAndImages = false }: { content: string; className?: string; inline?: boolean; inertLinksAndImages?: boolean }) {
  const classes = ["math-text", className].filter(Boolean).join(" ");
  const cleanedContent = normalizeMathText(content, { inline });
  const components = inertLinksAndImages ? inertImportedMarkdownComponents : undefined;
  if (inline) {
    return <span className={classes}><Markdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { macros: mathMacros, throwOnError: false }]]} components={{ ...(components ?? {}), p: ({ children }) => <span>{children}</span> }}>{cleanedContent}</Markdown></span>;
  }

  return <div className={classes}><Markdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { macros: mathMacros, throwOnError: false }]]} components={components}>{cleanedContent}</Markdown></div>;
}
