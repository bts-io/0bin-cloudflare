import { useEffect, useState } from "react";
import type { Highlighted } from "../../lib/highlight";
import { displayText, highlightPlan } from "../../lib/view";

/**
 * Loads the highlighter on demand and highlights `text`. Null until it is ready, when the text is too large or
 * plain, or when nothing was recognised: the caller then shows the text as plain lines.
 */
export function useHighlight(text: string | null, byteLength: number, lang: string | undefined) {
  const [result, setResult] = useState<Highlighted | null>(null);
  useEffect(() => {
    setResult(null);
    if (text === null) return;
    const plan = highlightPlan(byteLength, lang);
    if (plan.mode === "none") return;
    let live = true;
    import("../../lib/highlight")
      .then(({ highlight }) => {
        if (live) setResult(highlight(displayText(text), plan));
      })
      // The chunk failed to load (offline, new deploy): the text stays readable, just not coloured.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [text, byteLength, lang]);
  return result;
}
