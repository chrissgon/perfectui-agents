/** Reading `class` attributes out of HTML without executing or fetching anything. */

export interface ClassToken {
  name: string;
  /** 1-based line of the token in the input. */
  line: number;
}

// `class="..."`, `class='...'`, `class=value`, and JSX's `className` in the same forms. The
// lookbehind skips `data-class`, Vue's `:class` and similar bindings, whose values are code.
const CLASS_ATTRIBUTE = /(?<![\w:.@-])(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`{}]+))/g;

/** Every class token in every class attribute, in document order, with its line. */
export function classTokens(html: string): ClassToken[] {
  // Comments are blanked (newlines kept) so a commented-out example is not read as markup.
  const text = html.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, " "));
  const newlines = [...text.matchAll(/\n/g)].map((m) => m.index);
  const tokens: ClassToken[] = [];
  for (const match of text.matchAll(CLASS_ATTRIBUTE)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    const valueStart = match.index + match[0].length - value.length - (match[3] === undefined ? 1 : 0);
    for (const word of value.matchAll(/\S+/g)) {
      const offset = valueStart + word.index;
      tokens.push({ name: word[0], line: lineAt(newlines, offset) });
    }
  }
  return tokens;
}

/** Distinct `pui-*` classes used in the HTML, sorted. */
export function puiClasses(html: string): string[] {
  return [...new Set(classTokens(html).map((t) => t.name).filter(isPuiClass))].sort();
}

export const isPuiClass = (name: string) => name.startsWith("pui-");

/** 1 + the number of newlines before `offset` (binary search over their sorted offsets). */
function lineAt(newlines: number[], offset: number): number {
  let low = 0;
  let high = newlines.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (newlines[mid]! < offset) low = mid + 1;
    else high = mid;
  }
  return low + 1;
}
