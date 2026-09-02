export function validateModelBaseUrl(value: string): { url: URL; originPattern: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid model base URL");
  }

  const isLocalHttp =
    url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new Error("Model base URL must use HTTPS or local HTTP");
  }
  if (url.username || url.password) {
    throw new Error("Model base URL must not include credentials");
  }
  if (url.hash) {
    throw new Error("Model base URL must not include a fragment");
  }
  if (url.search) {
    throw new Error("Model base URL must not include a query string");
  }

  url.pathname = url.pathname.replace(/\/+$/u, "");
  return { url, originPattern: `${url.origin}/*` };
}

export function endpointUrl(baseUrl: string, pathname: string): string {
  const { url } = validateModelBaseUrl(baseUrl);
  const basePath = url.pathname.replace(/\/+$/u, "");
  const endpoint = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (basePath === endpoint || basePath.endsWith(endpoint)) {
    url.pathname = basePath;
    return url.toString();
  }
  const knownEndpoint = [
    "/v1/messages",
    "/v1/chat/completions",
    "/chat/completions",
  ].find((suffix) => basePath.endsWith(suffix));
  if (knownEndpoint !== undefined) {
    url.pathname = `${basePath.slice(0, -knownEndpoint.length)}${endpoint}`.replace(/\/+/gu, "/");
    return url.toString();
  }
  if (basePath.endsWith("/v1") && endpoint.startsWith("/v1/")) {
    url.pathname = `${basePath}${endpoint.slice(3)}`.replace(/\/+/gu, "/");
    return url.toString();
  }
  url.pathname = `${basePath}${endpoint}`.replace(/\/+/gu, "/");
  return url.toString();
}
