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

  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  return { url, originPattern: `${url.origin}/*` };
}

export function endpointUrl(baseUrl: string, pathname: string): string {
  const { url } = validateModelBaseUrl(baseUrl);
  const basePath = url.pathname.replace(/\/+$/u, "");
  const endpoint = pathname.startsWith("/") ? pathname : `/${pathname}`;
  url.pathname = `${basePath}${endpoint}`.replace(/\/+/gu, "/");
  return url.toString();
}
