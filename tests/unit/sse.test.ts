import { describe, expect, it } from "vitest";
import { parseSse } from "@/services/llm/sse";

const encoder = new TextEncoder();

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect(chunks: string[]) {
  const events = [];
  for await (const event of parseSse(streamFrom(chunks))) {
    events.push(event);
  }
  return events;
}

describe("parseSse", () => {
  it("parses data split across network boundaries", async () => {
    await expect(
      collect(["data: {\"choices\":[{\"delta\":{\"con", "tent\":\"Hi\"}}]}\n\ndata: [DONE]\n\n"]),
    ).resolves.toEqual([
      { data: '{"choices":[{"delta":{"content":"Hi"}}]}' },
      { data: "[DONE]" },
    ]);
  });

  it("handles CRLF, multiline data, comments, and unknown event names", async () => {
    await expect(
      collect([
        ": keepalive\r\nevent: custom_event\r\ndata: first\r\ndata: second\r\n\r\n",
      ]),
    ).resolves.toEqual([{ event: "custom_event", data: "first\nsecond" }]);
  });
});
