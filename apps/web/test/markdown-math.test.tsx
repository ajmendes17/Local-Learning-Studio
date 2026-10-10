import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownMath } from "../src/components/MarkdownMath";

test("math content repairs damaged TeX and renders with KaTeX", () => {
  const html = renderToStaticMarkup(createElement(MarkdownMath, { content: "The state is $\u007f\\ket{0}$ and the density is $I/2$." }));
  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /\$\s*\\ket|\u007f/);
});

test("inline professor topics and multi-line formulas use KaTeX", () => {
  const inline = renderToStaticMarkup(createElement(MarkdownMath, {
    inline: true,
    content: String.raw`Partial trace of $\rho_{AB}$ and $\operatorname{Tr}_B(\rho_{AB}) = I/2$`,
  }));
  const display = renderToStaticMarkup(createElement(MarkdownMath, {
    content: String.raw`The state is:

$$
\ket{\Phi^+}_{AB} = (\ket{00} + \ket{11})/\sqrt{2}
$$`,
  }));
  assert.match(inline, /class="katex"/);
  assert.match(display, /class="katex-display"/);
  assert.match(display, /class="katex"/);
});

test("inline ket-bra products render as a single valid math expression", () => {
  const html = renderToStaticMarkup(createElement(MarkdownMath, {
    inline: true,
    content: "|+⟩⟨+|",
  }));

  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /katex-error|ParseError/);
});

test("PDF-style reconstructed Dirac fractions render as math", () => {
  const html = renderToStaticMarkup(createElement(MarkdownMath, {
    content: String.raw`Bell state: $\frac{\ket{0}+\ket{1}}{\sqrt{2}}$`,
  }));

  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /katex-error|\|0〉|\|1〉/);
});

test("Unicode subscript and superscript ket labels render through KaTeX", () => {
  const html = renderToStaticMarkup(createElement(MarkdownMath, {
    inline: true,
    content: "|ψ₁⟩, |Φ⁺⟩, and |n²⟩",
  }));

  assert.equal((html.match(/class="katex"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /katex-error|ParseError|ψ₁|Φ⁺|n²/);
});

test("imported Markdown keeps links and images inert while rendering text", () => {
  const html = renderToStaticMarkup(createElement(MarkdownMath, {
    content: "![diagram](https://example.invalid/image.png)\n\n[external reference](https://example.invalid/page)",
    inertLinksAndImages: true,
  }));
  assert.match(html, /diagram/);
  assert.match(html, /external reference/);
  assert.doesNotMatch(html, /<img|<a\b|https:\/\/example\.invalid/);
});
