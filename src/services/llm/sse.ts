export interface SseEvent {
  event?: string;
  data: string;
  id?: string;
}

export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parsed = drainEvents(buffer);
      buffer = parsed.remaining;
      yield* parsed.events;
    }

    buffer += decoder.decode();
    const parsed = drainEvents(`${buffer}\n\n`);
    yield* parsed.events;
  } finally {
    reader.releaseLock();
  }
}

function drainEvents(value: string): { events: SseEvent[]; remaining: string } {
  const events: SseEvent[] = [];
  let cursor = 0;

  while (true) {
    const boundary = findEventBoundary(value, cursor);
    if (boundary === undefined) break;

    const block = value.slice(cursor, boundary.start);
    cursor = boundary.end;
    const event = parseEvent(block);
    if (event !== undefined) events.push(event);
  }

  return { events, remaining: value.slice(cursor) };
}

function findEventBoundary(value: string, start: number): { start: number; end: number } | undefined {
  const lineFeedBoundary = value.indexOf("\n\n", start);
  const carriageReturnBoundary = value.indexOf("\r\n\r\n", start);

  if (lineFeedBoundary === -1 && carriageReturnBoundary === -1) return undefined;
  if (lineFeedBoundary === -1) return { start: carriageReturnBoundary, end: carriageReturnBoundary + 4 };
  if (carriageReturnBoundary === -1) return { start: lineFeedBoundary, end: lineFeedBoundary + 2 };
  return lineFeedBoundary < carriageReturnBoundary
    ? { start: lineFeedBoundary, end: lineFeedBoundary + 2 }
    : { start: carriageReturnBoundary, end: carriageReturnBoundary + 4 };
}

function parseEvent(block: string): SseEvent | undefined {
  let event: string | undefined;
  let id: string | undefined;
  const data: string[] = [];

  for (const line of block.split(/\r?\n/u)) {
    if (line.length === 0 || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const fieldValue = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /u, "");

    if (field === "event") event = fieldValue;
    if (field === "id") id = fieldValue;
    if (field === "data") data.push(fieldValue);
  }

  if (data.length === 0) return undefined;
  return { ...(event === undefined ? {} : { event }), data: data.join("\n"), ...(id === undefined ? {} : { id }) };
}
