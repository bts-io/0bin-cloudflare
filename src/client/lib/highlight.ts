/**
 * highlight.js core with exactly the languages in LANGUAGES (spec 8.5). The view page loads this module with a
 * dynamic import, so neither the core nor the grammars are in any other page's bundle.
 */
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import lua from "highlight.js/lib/languages/lua";
import makefile from "highlight.js/lib/languages/makefile";
import markdown from "highlight.js/lib/languages/markdown";
import nginx from "highlight.js/lib/languages/nginx";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import type { Language } from "./languages";
import { AUTO_SAMPLE_CHARS, type HighlightPlan } from "./view";

// Keyed by Language, so the compiler keeps this list and LANGUAGES identical.
const GRAMMARS = {
  plaintext,
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  graphql,
  ini,
  java,
  javascript,
  json,
  kotlin,
  lua,
  makefile,
  markdown,
  nginx,
  php,
  powershell,
  python,
  ruby,
  rust,
  scss,
  shell,
  sql,
  swift,
  typescript,
  xml,
  yaml,
} satisfies Record<Exclude<Language, "auto">, unknown>;

for (const [id, grammar] of Object.entries(GRAMMARS)) hljs.registerLanguage(id, grammar);

export interface Highlighted {
  /** highlight.js output: its own `<span class>` tags around HTML-escaped text, nothing else. */
  html: string;
  language: string;
}

/**
 * Below this highlight.js relevance an auto guess is noise. Measured with our language set: prose scores 1-3
 * for some language just by containing "for" or "the", while real snippets (nginx, python, js, json, bash,
 * yaml) score 4 and up. A two-line snippet may stay plain; the creator can pick its language instead.
 */
export const MIN_AUTO_RELEVANCE = 4;

/**
 * Highlights `text` per the plan. Auto mode guesses from the first 100 KB only, then highlights the whole text
 * in that language; null when nothing was recognised with confidence and the text should stay plain.
 */
export function highlight(text: string, plan: Exclude<HighlightPlan, { mode: "none" }>): Highlighted | null {
  let language = plan.mode === "language" ? plan.language : undefined;
  if (plan.mode === "auto") {
    const guess = hljs.highlightAuto(text.slice(0, AUTO_SAMPLE_CHARS));
    if (guess.relevance >= MIN_AUTO_RELEVANCE) language = guess.language;
  }
  if (!language) return null;
  return { html: hljs.highlight(text, { language, ignoreIllegals: true }).value, language };
}
