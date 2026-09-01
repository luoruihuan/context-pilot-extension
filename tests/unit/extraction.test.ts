import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Readability } from "@mozilla/readability";
import { extractPage, waitForStableDom } from "@/services/extraction";

const fixturesPath = join(process.cwd(), "tests/fixtures/pages");

function fixture(name: string): string {
  return readFileSync(join(fixturesPath, name), "utf8");
}

function page(html: string, url = "https://example.com/a"): Document {
  return new JSDOM(html, { url }).window.document;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("extractPage", () => {
  it("removes navigation and extracts article text", async () => {
    const snapshot = await extractPage({
      tabId: 7,
      sourceId: "T1",
      document: page(fixture("article.html")),
      locationHref: "https://example.com/a",
      waitForStableDom: false,
    });

    expect(snapshot.plainText).toContain("Main article paragraph");
    expect(snapshot.plainText).not.toContain("Navigation item");
    expect(snapshot.plainText).not.toContain("Hidden article copy");
    expect(snapshot.description).toBe("A concise article description");
    expect(snapshot.headings).toContainEqual({ level: 2, text: "Overview" });
    expect(snapshot.lists).toEqual([["First visible item", "Second visible item"]]);
    expect(snapshot.extractionMethod).toBe("readability");
  });

  it("extracts HTML tables", async () => {
    const snapshot = await extractPage({
      tabId: 7,
      sourceId: "T1",
      document: page(fixture("table.html"), "https://example.com/table"),
      locationHref: "https://example.com/table",
      waitForStableDom: false,
    });

    expect(snapshot.tables[0]).toEqual({ headers: ["Name", "Value"], rows: [["Alpha", "42"]] });
  });

  it("falls back to cleaned visible text when Readability has no article", async () => {
    const snapshot = await extractPage({
      tabId: 7,
      sourceId: "T1",
      document: page(fixture("noisy-page.html")),
      locationHref: "https://example.com/a",
      waitForStableDom: false,
    });

    expect(snapshot.extractionMethod).toBe("visible-text");
    expect(snapshot.plainText).toContain("Visible fallback paragraph.");
    expect(snapshot.plainText).not.toContain("Navigation item");
    expect(snapshot.plainText).not.toContain("Invisible styled content");
  });

  it("falls back to cleaned visible text when Readability throws", async () => {
    const parse = vi.spyOn(Readability.prototype, "parse").mockImplementation(() => {
      throw new Error("parse failed");
    });

    const snapshot = await extractPage({
      tabId: 7,
      sourceId: "T1",
      document: page(fixture("noisy-page.html")),
      locationHref: "https://example.com/a",
      waitForStableDom: false,
    });

    expect(parse).toHaveBeenCalledOnce();
    expect(snapshot.extractionMethod).toBe("visible-text");
    expect(snapshot.plainText).toContain("Visible fallback paragraph.");
    expect(snapshot.plainText).not.toContain("Navigation item");
  });

  it("rejects an extraction whose task or URL became stale", async () => {
    const document = page(fixture("article.html"));

    await expect(
      extractPage({
        tabId: 7,
        sourceId: "T1",
        document,
        locationHref: "https://example.com/a",
        taskId: "request-1",
        getCurrentTaskId: () => "request-2",
        waitForStableDom: false,
      }),
    ).rejects.toThrow("stale");

    await expect(
      extractPage({
        tabId: 7,
        sourceId: "T1",
        document,
        locationHref: "https://example.com/a",
        getCurrentLocationHref: () => "https://example.com/b",
        waitForStableDom: false,
      }),
    ).rejects.toThrow("stale");
  });
});

describe("waitForStableDom", () => {
  it("resets its quiet timer after a DOM mutation", async () => {
    vi.useFakeTimers();
    const document = page("<html><body><main>Initial</main></body></html>");
    const settled = waitForStableDom({ document, quietMs: 400, maxWaitMs: 3000 });

    await vi.advanceTimersByTimeAsync(300);
    document.body.append(document.createElement("p"));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(399);
    let complete = false;
    void settled.then(() => {
      complete = true;
    });

    expect(complete).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(settled).resolves.toBeUndefined();
  });
});
