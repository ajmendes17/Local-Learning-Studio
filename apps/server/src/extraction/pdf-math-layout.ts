export interface PositionedPdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
}

interface FractionReplacement {
  endIndex: number;
  tex: string;
}

function normalizeFractionDiracNotation(expression: string) {
  return expression
    .replace(/\|\s*([^|〈⟨〉⟩]{1,32}?)\s*[〉⟩]/gu, (_match, state: string) => `\\ket{${state.trim().replace(/\s+/g, "")}}`)
    .replace(/[〈⟨]\s*([^|〈⟨〉⟩]{1,32}?)\s*\|/gu, (_match, state: string) => `\\bra{${state.trim().replace(/\s+/g, "")}}`);
}

function textAt(items: PositionedPdfTextItem[], index: number) {
  return items[index]?.str.trim() ?? "";
}

export function reconstructStackedSquareRootFractions(items: PositionedPdfTextItem[]) {
  const replacements = new Map<number, FractionReplacement>();

  for (let rootIndex = 0; rootIndex < items.length - 1; rootIndex += 1) {
    const root = items[rootIndex]!;
    if (!root.str.includes("√")) continue;
    let radicandIndex = rootIndex + 1;
    while (radicandIndex < items.length && !textAt(items, radicandIndex)) radicandIndex += 1;
    const radicand = items[radicandIndex];
    const radicandText = radicand?.str.replace(/\s+/g, "") ?? "";
    if (!radicand || !/^[A-Za-z0-9]+$/.test(radicandText)) continue;

    const rootX = root.transform[4]!;
    const rootY = root.transform[5]!;
    const rootRight = rootX + root.width;
    const radicandX = radicand.transform[4]!;
    const radicandY = radicand.transform[5]!;
    const radicandRight = radicandX + radicand.width;
    if (rootY - radicandY < 2 || rootY - radicandY > 18) continue;
    if (Math.abs(radicandX - rootRight) > 2.5) continue;

    let lastNumeratorIndex = rootIndex - 1;
    while (lastNumeratorIndex >= 0 && !textAt(items, lastNumeratorIndex)) lastNumeratorIndex -= 1;
    if (lastNumeratorIndex < 0) continue;
    const numeratorY = items[lastNumeratorIndex]!.transform[5]!;
    if (numeratorY - rootY < 2 || numeratorY - rootY > 18) continue;

    let firstNumeratorIndex = lastNumeratorIndex;
    for (let index = lastNumeratorIndex - 1; index >= 0; index -= 1) {
      const item = items[index]!;
      if (Math.abs(item.transform[5]! - numeratorY) > 1.25) break;
      firstNumeratorIndex = index;
    }
    const numerator = items.slice(firstNumeratorIndex, rootIndex).map(({ str }) => str).join("").trim();
    if (!numerator) continue;

    const numeratorItems = items.slice(firstNumeratorIndex, rootIndex).filter((item) => item.str.trim());
    const numeratorLeft = Math.min(...numeratorItems.map((item) => item.transform[4]!));
    const numeratorRight = Math.max(...numeratorItems.map((item) => item.transform[4]! + item.width));
    const numeratorCenter = (numeratorLeft + numeratorRight) / 2;
    const denominatorCenter = (rootX + radicandRight) / 2;
    if (Math.abs(numeratorCenter - denominatorCenter) > Math.max(3, (numeratorRight - numeratorLeft) * 0.35)) continue;

    replacements.set(firstNumeratorIndex, {
      endIndex: radicandIndex,
      tex: `$\\frac{${normalizeFractionDiracNotation(numerator)}}{\\sqrt{${radicandText}}}$`,
    });
  }

  let text = "";
  for (let index = 0; index < items.length; index += 1) {
    const replacement = replacements.get(index);
    if (replacement) {
      text += ` ${replacement.tex} `;
      index = replacement.endIndex;
      continue;
    }
    const item = items[index]!;
    text += item.str;
    text += item.hasEOL ? "\n" : " ";
  }
  return text;
}
