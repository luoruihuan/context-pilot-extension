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
const MAX_SOURCES = 10;

function clipEscaped(value: string, limit: number): { value: string; truncated: boolean } {
  let escapedLength = 0;
  let endIndex = 0;

  for (const character of value) {
    const escapedCharacter = escapeXml(character);
    if (escapedLength + escapedCharacter.length > limit) break;
    escapedLength += escapedCharacter.length;
    endIndex += character.length;
  }

  return { value: value.slice(0, endIndex), truncated: endIndex < value.length };
}

function sourceMarkup(snapshot: PageSnapshot, content: string): string {
  return `<source id="${escapeXml(snapshot.sourceId)}" trust="untrusted-web-content">\n<title>${escapeXml(snapshot.title)}</title>\n<url>${escapeXml(snapshot.url)}</url>\n<content>${escapeXml(content)}</content>\n</source>`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
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
  const includedSnapshots = snapshots.slice(0, MAX_SOURCES);
  const maxTotalCharacters = limits.maxTotalCharacters ?? DEFAULT_MAX_TOTAL_CHARACTERS;
  const maxPageCharacters = limits.maxPageCharacters ?? DEFAULT_MAX_PAGE_CHARACTERS;
  let remaining = maxTotalCharacters;
  let truncated = snapshots.length > MAX_SOURCES;
  const chunks: string[] = [];

  for (const snapshot of includedSnapshots) {
    const separatorLength = chunks.length > 0 ? 1 : 0;
    const frame = sourceMarkup(snapshot, "");
    if (remaining < separatorLength + frame.length) {
      truncated = true;
      break;
    }
    const availableContent = Math.max(0, Math.min(maxPageCharacters, remaining - frame.length - separatorLength));
    const clipped = clipEscaped(prioritizedContent(snapshot), availableContent);
    const markup = sourceMarkup(snapshot, clipped.value);
    chunks.push(markup);
    remaining -= separatorLength + markup.length;
    truncated ||= clipped.truncated;
  }

  const text = chunks.join("\n");
  return {
    text,
    sources: includedSnapshots.map(({ sourceId, title, url, extractedAt }) => ({ sourceId, title, url, extractedAt })),
    totalCharacters: text.length,
    truncated,
  };
}
