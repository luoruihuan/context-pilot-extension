import { Readability } from "@mozilla/readability";
import type { PageSnapshot } from "@/shared/types/domain";
import { cleanDocument, normalizedText } from "./clean-document";
import { waitForStableDom as waitForStableDomImpl } from "./wait-for-stable-dom";

const MIN_READABILITY_CONTENT_LENGTH = 100;

export interface ExtractPageInput {
  tabId: number;
  sourceId: string;
  document: Document;
  locationHref: string;
  taskId?: string;
  getCurrentTaskId?: () => string | undefined;
  getCurrentLocationHref?: () => string;
  waitForStableDom?: boolean;
}

function extractHeadings(document: Document): PageSnapshot["headings"] {
  return Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
    .map((heading) => ({ level: Number(heading.tagName.slice(1)), text: normalizedText(heading.textContent) }))
    .filter((heading) => heading.text.length > 0);
}

function extractParagraphs(document: Document): string[] {
  return Array.from(document.querySelectorAll("p"))
    .map((paragraph) => normalizedText(paragraph.textContent))
    .filter(Boolean);
}

function extractLists(document: Document): string[][] {
  return Array.from(document.querySelectorAll("ul, ol"))
    .map((list) =>
      Array.from(list.querySelectorAll(":scope > li"))
        .map((item) => normalizedText(item.textContent))
        .filter(Boolean),
    )
    .filter((list) => list.length > 0);
}

function extractTables(document: Document): PageSnapshot["tables"] {
  return Array.from(document.querySelectorAll("table")).map((table) => {
    const tableRows = Array.from(table.querySelectorAll("tr"));
    const headerRow = tableRows.find((row) => row.querySelector("th"));
    const headers = headerRow
      ? Array.from(headerRow.querySelectorAll("th")).map((cell) => normalizedText(cell.textContent))
      : [];
    const rows = tableRows
      .filter((row) => row !== headerRow)
      .map((row) => Array.from(row.querySelectorAll("td, th")).map((cell) => normalizedText(cell.textContent)))
      .filter((row) => row.length > 0);

    return { headers, rows };
  });
}

function assertCurrentTask(input: ExtractPageInput): void {
  const currentTaskId = input.getCurrentTaskId?.();
  if (input.taskId && currentTaskId !== undefined && currentTaskId !== input.taskId) {
    throw new Error("Page extraction became stale because the task changed");
  }
}

export async function extractPage(input: ExtractPageInput): Promise<PageSnapshot> {
  let extractionUrl = input.locationHref;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const protocol = new URL(extractionUrl).protocol;
    if (protocol !== "http:" && protocol !== "https:") {
      throw new Error("Page extraction only supports HTTP and HTTPS URLs");
    }

    if (input.waitForStableDom !== false) {
      await waitForStableDomImpl({ document: input.document });
    }
    assertCurrentTask(input);
    const stableUrl = input.getCurrentLocationHref?.() ?? extractionUrl;
    if (stableUrl !== extractionUrl) {
      if (attempt === 0) {
        extractionUrl = stableUrl;
        continue;
      }
      throw new Error("Page extraction became stale because the URL kept changing");
    }

    const cleaned = cleanDocument(input.document);
    const title = normalizedText(cleaned.querySelector("title")?.textContent);
    const description = normalizedText(cleaned.querySelector("meta[name='description']")?.getAttribute("content"));
    const headings = extractHeadings(cleaned);
    const paragraphs = extractParagraphs(cleaned);
    const lists = extractLists(cleaned);
    const tables = extractTables(cleaned);
    let readability: ReturnType<Readability["parse"]> = null;
    try {
      readability = new Readability(cleaned).parse();
    } catch {
      // A malformed document must not prevent the visible-text fallback.
    }
    const readableText = normalizedText(readability?.textContent);
    const useReadability = readableText.length >= MIN_READABILITY_CONTENT_LENGTH;
    const plainText = useReadability ? readableText : normalizedText(cleaned.body.textContent);
    const extractionMethod = useReadability ? "readability" : "visible-text";

    assertCurrentTask(input);
    const completedUrl = input.getCurrentLocationHref?.() ?? extractionUrl;
    if (completedUrl !== extractionUrl) {
      if (attempt === 0) {
        extractionUrl = completedUrl;
        continue;
      }
      throw new Error("Page extraction became stale because the URL kept changing");
    }
    return {
      sourceId: input.sourceId,
      tabId: input.tabId,
      title: title || normalizedText(readability?.title),
      url: extractionUrl,
      extractedAt: Date.now(),
      routeVersion: extractionUrl,
      ...(description ? { description } : {}),
      headings,
      paragraphs,
      lists,
      tables,
      plainText,
      extractionMethod,
      truncated: false,
    };
  }

  throw new Error("Page extraction became stale");
}
