import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { articlePage, spaPage, tablePage } from "./test-pages";

export interface MockAiServer {
  origin: string;
  localhostOrigin: string;
  requests: Array<{ method: string; path: string; body: string }>;
  close(): Promise<void>;
}

function json(response: ServerResponse, value: unknown): void {
  response.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
  response.end(JSON.stringify(value));
}

function html(response: ServerResponse, value: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(value);
}

async function bodyOf(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) body += String(chunk);
  return body;
}

function writeSplit(response: ServerResponse, value: string): void {
  const midpoint = Math.max(1, Math.floor(value.length / 2));
  response.write(value.slice(0, midpoint));
  response.write(value.slice(midpoint));
}

async function openAiStream(
  request: IncomingMessage,
  response: ServerResponse,
  requests: MockAiServer["requests"],
): Promise<void> {
  const body = await bodyOf(request);
  requests.push({ method: request.method ?? "GET", path: "/v1/chat/completions", body });
  let payload: { messages?: Array<{ content?: string }> } = {};
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    response.writeHead(400, { "access-control-allow-origin": "*" });
    response.end("Invalid JSON");
    return;
  }
  const prompt = payload.messages?.map((message) => message.content ?? "").join("\n") ?? "";
  const isSpa = prompt.includes("区域能源看板");
  if (isSpa && (!prompt.includes("4.8 吉瓦时") || !prompt.includes("六小时") || prompt.includes("2.1 吉瓦时"))) {
    response.writeHead(422, { "access-control-allow-origin": "*", "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "SPA context was stale" } }));
    return;
  }
  const slow = prompt.includes("停止生成");
  const answer = prompt.includes("比较两个页面")
    ? "T1 与 T2 的比较结果：两页都显示 4.8 吉瓦时，SPA 已更新为六小时维护窗口。"
    : body.includes("表格")
      ? "表格显示北港发电量 4.8 GWh，维护窗口 6 小时。"
      : "当前页总结：北港部署三台潮汐涡轮机，年发电量预计 4.8 吉瓦时。";
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "access-control-allow-origin": "*",
    "x-request-id": "openai-e2e",
  });
  writeSplit(response, `data: ${JSON.stringify({ choices: [{ delta: { content: answer.slice(0, 18) }, finish_reason: null }] })}\n\n`);
  if (slow) await new Promise((resolve) => setTimeout(resolve, 1_500));
  if (response.destroyed) return;
  writeSplit(response, `data: ${JSON.stringify({ choices: [{ delta: { content: answer.slice(18) }, finish_reason: "stop" }] })}\n\n`);
  response.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 84, completion_tokens: 22 } })}\n\n`);
  response.end("data: [DONE]\n\n");
}

async function anthropicStream(
  request: IncomingMessage,
  response: ServerResponse,
  requests: MockAiServer["requests"],
): Promise<void> {
  const body = await bodyOf(request);
  requests.push({ method: request.method ?? "GET", path: "/anthropic/v1/messages", body });
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "access-control-allow-origin": "*",
    "request-id": "anthropic-e2e",
  });
  writeSplit(response, `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 42, output_tokens: 0 } } })}\n\n`);
  writeSplit(response, `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Anthropic 当前页总结：潮汐能项目进展稳定。" } })}\n\n`);
  response.write(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 14 } })}\n\n`);
  response.end(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
}

export async function startMockAiServer(): Promise<MockAiServer> {
  const requests: MockAiServer["requests"] = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization,content-type,x-api-key,anthropic-version",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      });
      response.end();
    } else if (url.pathname === "/article") html(response, articlePage());
    else if (url.pathname === "/spa") html(response, spaPage());
    else if (url.pathname === "/table") html(response, tablePage());
    else if (url.pathname === "/v1/models") {
      requests.push({ method: request.method ?? "GET", path: url.pathname, body: "" });
      json(response, { data: [{ id: "mock-model" }] });
    } else if (url.pathname === "/v1/chat/completions") await openAiStream(request, response, requests);
    else if (url.pathname === "/anthropic/v1/models") {
      requests.push({ method: request.method ?? "GET", path: url.pathname, body: "" });
      json(response, { data: [{ id: "mock-claude" }] });
    } else if (url.pathname === "/anthropic/v1/messages") await anthropicStream(request, response, requests);
    else {
      response.writeHead(404, { "access-control-allow-origin": "*" });
      response.end("Not found");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    localhostOrigin: `http://localhost:${port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
