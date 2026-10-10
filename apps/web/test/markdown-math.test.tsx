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

test("imported Markdown keeps links and images inert while rendering text", () => {
  const html = renderToStaticMarkup(createElement(MarkdownMath, {
    content: "![diagram](https://example.invalid/image.png)\n\n[external reference](https://example.invalid/page)",
    inertLinksAndImages: true,
  }));
  assert.match(html, /diagram/);
  assert.match(html, /external reference/);
  assert.doesNotMatch(html, /<img|<a\b|https:\/\/example\.invalid/);
});
