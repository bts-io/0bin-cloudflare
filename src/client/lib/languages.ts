/**
 * Languages offered on the create page and loaded by the view page's highlighter (highlight.js ids, spec 8.5).
 * "auto" lets the viewer guess; "plaintext" turns highlighting off.
 */
export const LANGUAGES = [
  ["auto", "auto"],
  ["plaintext", "plain text"],
  ["bash", "bash"],
  ["c", "c"],
  ["cpp", "c++"],
  ["csharp", "c#"],
  ["css", "css"],
  ["diff", "diff"],
  ["dockerfile", "dockerfile"],
  ["go", "go"],
  ["graphql", "graphql"],
  ["ini", "ini / toml"],
  ["java", "java"],
  ["javascript", "javascript"],
  ["json", "json"],
  ["kotlin", "kotlin"],
  ["lua", "lua"],
  ["makefile", "makefile"],
  ["markdown", "markdown"],
  ["nginx", "nginx"],
  ["php", "php"],
  ["powershell", "powershell"],
  ["python", "python"],
  ["ruby", "ruby"],
  ["rust", "rust"],
  ["scss", "scss"],
  ["shell", "shell session"],
  ["sql", "sql"],
  ["swift", "swift"],
  ["typescript", "typescript"],
  ["xml", "html / xml"],
  ["yaml", "yaml"],
] as const;

export type Language = (typeof LANGUAGES)[number][0];
