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

const diracSymbols: Record<string, string> = {
  "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta", "ε": "\\epsilon", "ζ": "\\zeta", "η": "\\eta", "θ": "\\theta",
  "κ": "\\kappa", "λ": "\\lambda", "μ": "\\mu", "ν": "\\nu", "ξ": "\\xi", "π": "\\pi", "ρ": "\\rho", "σ": "\\sigma", "τ": "\\tau", "φ": "\\phi", "χ": "\\chi", "ψ": "\\psi", "ω": "\\omega",
  "Γ": "\\Gamma", "Δ": "\\Delta", "Θ": "\\Theta", "Λ": "\\Lambda", "Ξ": "\\Xi", "Π": "\\Pi", "Σ": "\\Sigma", "Φ": "\\Phi", "Ψ": "\\Psi", "Ω": "\\Omega",
};

function diracLabel(label: string) {
  const compact = label.trim().replace(/\s+/g, "").replace(/[−–]/g, "-");
  return compact
    .replace(/([α-ωΑ-Ω])([+-])/gu, "$1^{$2}")
    .replace(/[α-ωΑ-Ω]/gu, (symbol) => diracSymbols[symbol] ?? symbol);
}

function normalizeDiracSegment(part: string, inMath: boolean) {
  const math = (expression: string) => inMath ? expression : `$${expression}$`;
  return part
    .replace(/[〈⟨]\s*([^|〈⟨〉⟩]{1,32}?)\s*\|\s*([^〈⟨〉⟩]{1,32}?)\s*[〉⟩]/gu,
      (_match, left: string, right: string) => math(`\\braket{${diracLabel(left)}|${diracLabel(right)}}`))
    .replace(/[〈⟨]\s*([^|〈⟨〉⟩]{1,32}?)\s*\|/gu,
      (_match, state: string) => math(`\\bra{${diracLabel(state)}}`))
    .replace(/\|\s*([^|〈⟨〉⟩]{1,32}?)\s*[〉⟩](?:\s+([AB]))?/gu,
      (_match, state: string, subsystem?: string) => math(`\\ket{${diracLabel(state)}}${subsystem ? `_${subsystem}` : ""}`))
    .replace(/√\s*([A-Za-z0-9]+)/gu,
      (_match, radicand: string) => math(`\\sqrt{${radicand}}`))
    .replace(/\s*⊗\s*/gu, inMath ? " \\otimes " : " $\\otimes$ ")
    .replace(/\s*⊕\s*/gu, inMath ? " \\oplus " : " $\\oplus$ ")
    .replace(/\s*≡\s*/gu, inMath ? " \\equiv " : " $\\equiv$ ");
}

function normalizeRawDiracNotation(content: string) {
  const parts = content.split(/(```[\s\S]*?```|`[^`\n]*`|\$\$?)/g);
  let inMath = false;
  return parts.map((part) => {
    if (part === "$" || part === "$$") {
      inMath = !inMath;
      return part;
    }
    if (part.startsWith("`") || !part) return part;
    return normalizeDiracSegment(part, inMath);
  }).join("");
}

export function normalizeMathText(input: string, options: { inline?: boolean } = {}) {
  const content = normalizeRawDiracNotation(normalizeMathDelimiters(input, options.inline ?? false));
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
