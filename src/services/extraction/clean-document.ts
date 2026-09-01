const REMOVED_SELECTORS = [
  "script",
  "style",
  "nav",
  "form",
  "input",
  "textarea",
  "select",
  "[hidden]",
  "[aria-hidden='true']",
  "[style*='display: none']",
  "[style*='display:none']",
  "[style*='visibility: hidden']",
  "[style*='visibility:hidden']",
];

export function cleanDocument(document: Document): Document {
  const cleaned = document.cloneNode(true) as Document;

  const sourceElements = Array.from(document.body.querySelectorAll<HTMLElement>("*"));
  const clonedElements = Array.from(cleaned.body.querySelectorAll<HTMLElement>("*"));
  for (let index = sourceElements.length - 1; index >= 0; index -= 1) {
    const element = sourceElements[index];
    const style = document.defaultView?.getComputedStyle(element);
    if (style?.display === "none" || style?.visibility === "hidden") {
      clonedElements[index].remove();
    }
  }
  cleaned.querySelectorAll(REMOVED_SELECTORS.join(",")).forEach((element) => element.remove());

  return cleaned;
}

export function normalizedText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}
