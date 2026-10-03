import { useMemo } from "react";
import { splitHighlighted, splitLines } from "../../lib/view";

/**
 * Numbered lines (numbers come from CSS counters in view.css). With `html` set, each line is highlight.js
 * output split per line: its own span tags around text it already escaped, and nothing else is ever injected.
 * Without it, lines are plain React text nodes.
 */
export function CodeBlock({ text, html, wrap }: { text: string; html: string | null; wrap: boolean }) {
  const rows = useMemo(() => (html === null ? null : splitHighlighted(html)), [html]);
  const plain = useMemo(() => splitLines(text), [text]);
  return (
    <div
      className={`overflow-x-auto px-4 py-4 font-mono text-sm leading-6 text-body ${wrap ? "code-wrap" : ""}`}
    >
      <div className="code-lines">
        {rows
          ? rows.map((line, i) => (
              <div className="code-line" key={i}>
                <span className="code-text" dangerouslySetInnerHTML={{ __html: line }} />
              </div>
            ))
          : plain.map((line, i) => (
              <div className="code-line" key={i}>
                <span className="code-text">{line}</span>
              </div>
            ))}
      </div>
    </div>
  );
}
