import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { normalizeMathText } from "@local-learning-studio/contracts";
import "katex/dist/katex.min.css";

const mathMacros = {
  "\\ket": "\\left|#1\\right\\rangle",
  "\\bra": "\\left\\langle#1\\right|",
  "\\braket": "\\left\\langle#1\\middle|#2\\right\\rangle",
  "\\expect": "\\left\\langle#1\\right\\rangle",
};

export function MathText({ content, className, inline = false }: { content: string; className?: string; inline?: boolean }) {
  const classes = ["math-text", className].filter(Boolean).join(" ");
  const cleanedContent = normalizeMathText(content, { inline });
  if (inline) {
    return <span className={classes}><Markdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { macros: mathMacros, throwOnError: false }]]} components={{ p: ({ children }) => <span>{children}</span> }}>{cleanedContent}</Markdown></span>;
  }

  return <div className={classes}><Markdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { macros: mathMacros, throwOnError: false }]]}>{cleanedContent}</Markdown></div>;
}
