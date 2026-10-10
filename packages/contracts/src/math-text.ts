function normalizeMathDelimiters(content: string, inline: boolean) {
  return content.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2 === 1) return part;
    return part
      .replace(/(?<!\\)\\\(([\s\S]*?)\\\)/g, (_match, expression: string) => `$${expression}$`)
      .replace(/(?<!\\)\\\[([\s\S]*?)\\\]/g, (match, expression: string, offset: number, whole: string) => {
        if (inline) return `$${expression}$`;
        const lineStart = whole.lastIndexOf("\n", offset - 1) + 1;
        const lineEnd = whole.indexOf("\n", offset + match.length);
        const before = whole.slice(lineStart, offset);
        const after = whole.slice(offset + match.length, lineEnd === -1 ? whole.length : lineEnd);
        return !before.trim() && !after.trim() ? `\n\n$$\n${expression}\n$$\n\n` : `$${expression}$`;
      });
  }).join("");
}

export function normalizeMathText(input: string, options: { inline?: boolean } = {}) {
  const content = normalizeMathDelimiters(input, options.inline ?? false);
  let inMath = false;
  return content.split(/(\$\$?)/g).map((part) => {
    if (part === "$" || part === "$$") {
      inMath = !inMath;
      return part;
    }
    if (!inMath) return part.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    return part
      .replace(/\rho(?![A-Za-z])/g, "\\rho")
      .replace(/\right(?![A-Za-z])/g, "\\right")
      .replace(/\theta(?![A-Za-z])/g, "\\theta")
      .replace(/\times(?![A-Za-z])/g, "\\times")
      .replace(/\tfrac(?![A-Za-z])/g, "\\tfrac")
      .replace(/\u0008(raket)(?![A-Za-z])/g, "\\braket")
      .replace(/\u0008(ra)(?![A-Za-z])/g, "\\bra")
      .replace(/\u0008(eta)(?![A-Za-z])/g, "\\beta")
      .replace(/\u0008(egin)(?![A-Za-z])/g, "\\begin")
      .replace(/\f(rac)(?![A-Za-z])/g, "\\frac")
      .replace(/\n(abla)(?![A-Za-z])/g, "\\nabla")
      .replace(/\n(u)(?![A-Za-z])/g, "\\nu")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\\\\(?=[A-Za-z])/g, "\\");
  }).join("");
}
