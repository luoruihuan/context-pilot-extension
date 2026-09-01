import type { PageSnapshot } from "@/shared/types/domain";

export interface ContextLimits {
  maxTotalCharacters?: number;
  maxPageCharacters?: number;
}

export interface BuiltContext {
  text: string;
  sources: Array<Pick<PageSnapshot, "sourceId" | "title" | "url" | "extractedAt">>;
  totalCharacters: number;
  truncated: boolean;
}

const DEFAULT_MAX_TOTAL_CHARACTERS = 60_000;
const DEFAULT_MAX_PAGE_CHARACTERS = 20_000;

function clip(value: string, limit: number): { value: string; truncated: boolean } {
  if (value.length <= limit) return { value, truncated: false };
  return { value: value.slice(0, limit), truncated: true };
}

function sourceMarkup(snapshot: PageSnapshot, content: string): string {
  return `<source id="${snapshot.sourceId}" trust="untrusted-web-content">\n<title>${snapshot.title}</title>\n<url>${snapshot.url}</url>\n<content>${content}</content>\n</source>`;
}

function prioritizedContent(snapshot: PageSnapshot): string {
  const listText = snapshot.lists.flat().join("\n");
  const tableText = snapshot.tables
    .flatMap((table) => [table.headers.join(" | "), ...table.rows.map((row) => row.join(" | "))])
    .filter(Boolean)
    .join("\n");

  return [snapshot.selectedText, snapshot.description, snapshot.plainText, listText, tableText]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export function buildContext(snapshots: PageSnapshot[], limits: ContextLimits = {}): BuiltContext {
  const maxTotalCharacters = limits.maxTotalCharacters ?? DEFAULT_MAX_TOTAL_CHARACTERS;
  const maxPageCharacters = limits.maxPageCharacters ?? DEFAULT_MAX_PAGE_CHARACTERS;
  let remaining = maxTotalCharacters;
  let truncated = false;
  const chunks: string[] = [];

  for (const snapshot of snapshots) {
    const separatorLength = chunks.length > 0 ? 1 : 0;
    const frame = sourceMarkup(snapshot, "");
    if (remaining < separatorLength + frame.length) {
      truncated = true;
      break;
    }
    const availableContent = Math.max(0, Math.min(maxPageCharacters, remaining - frame.length - separatorLength));
    const clipped = clip(prioritizedContent(snapshot), availableContent);
    const markup = sourceMarkup(snapshot, clipped.value);
    chunks.push(markup);
    remaining -= separatorLength + markup.length;
    truncated ||= clipped.truncated;
  }

  const text = chunks.join("\n");
  return {
    text,
    sources: snapshots.map(({ sourceId, title, url, extractedAt }) => ({ sourceId, title, url, extractedAt })),
    totalCharacters: text.length,
    truncated,
  };
}
