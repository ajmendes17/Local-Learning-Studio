import { DOMParser, type Node, type Element } from "@xmldom/xmldom";

export function sourceUrl(value: string, origin: string) {
  try {
    const url = new URL(value, origin);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    // Provenance uses canonical links, never signed/download credential queries.
    const ordinaryParams = new Set(["v", "list", "t", "start", "page", "chapter", "section", "id"]);
    for (const key of [...url.searchParams.keys()]) if (!ordinaryParams.has(key.toLowerCase())) url.searchParams.delete(key);
    url.hash = "";
    return url.href;
  } catch { return null; }
}
function documentFor(html: string) {
  return new DOMParser({ onError: () => {} }).parseFromString(`<html><body>${html}</body></html>`, "text/html");
}
export function htmlReferences(html: string, origin: string, courseId: string) {
  const files = new Set<string>();
  const pages = new Map<string, string>();
  const document = documentFor(html);
  for (const element of Array.from(document.getElementsByTagName("*"))) {
    for (const attribute of ["href", "src", "data-api-endpoint"]) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      try {
        const url = new URL(value, origin);
        if (url.origin !== origin) continue;
        const file = url.pathname.match(/^\/(?:api\/v1\/)?(?:courses\/\d+\/)?files\/(\d+)(?:\/|$)/)?.[1];
        if (file) files.add(file);
        const prefix = `/courses/${courseId}/pages/`;
        if (url.pathname.startsWith(prefix)) pages.set(decodeURIComponent(url.pathname.slice(prefix.length)), element.textContent?.trim() || "Canvas page");
      } catch { /* An invalid link is not a resource. */ }
    }
  }
  return { files, pages };
}
export function htmlMarkdown(html: string, origin: string) {
  const document = documentFor(html);
  for (const tag of ["script", "style", "iframe", "object", "svg", "noscript"]) {
    for (const element of Array.from(document.getElementsByTagName(tag))) element.parentNode?.removeChild(element);
  }
  const render = (node: Node | null): string => {
    if (!node) return "";
    if (node.nodeType === 3) return node.nodeValue ?? "";
    const content = Array.from(node.childNodes ?? []).map((child) => render(child)).join("");
    const name = node.nodeName.toLowerCase();
    if (name === "a" && node.nodeType === 1) {
      const href = (node as Element).getAttribute("href");
      const link = href ? sourceUrl(href, origin) : null;
      return link ? `[${content.trim() || link}](${link})` : content;
    }
    if (/^h[1-6]$/.test(name)) return `\n\n${"#".repeat(Number(name[1]))} ${content.trim()}\n\n`;
    if (name === "li") return `\n- ${content.trim()}`;
    if (name === "br") return "\n";
    if (name === "td" || name === "th") return `${content.trim()} | `;
    if (name === "pre") return `\n\n\`\`\`\n${content}\n\`\`\`\n\n`;
    return ["p", "div", "section", "tr", "table", "ul", "ol"].includes(name) ? `\n${content}\n` : content;
  };
  return render(document.documentElement).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
