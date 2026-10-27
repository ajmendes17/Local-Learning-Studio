import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export class CanvasError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
export interface CanvasConnectionOptions {
  baseUrl: string;
  token?: string;
  request?: typeof fetch;
  resolve?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
}

const privateV4 = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) privateV4.addSubnet(address, prefix);
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
export function publicAddress(address: string) {
  return isIP(address) === 4 ? !privateV4.check(address) : isIP(address) === 6 && globalV6.check(address, "ipv6");
}

export async function readBounded(response: Response, limit: number) {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new CanvasError("The Canvas response exceeds the size limit.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > limit) throw new CanvasError("The Canvas response exceeds the size limit.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class CanvasClient {
  readonly origin: string;
  private readonly request: typeof fetch;
  private readonly resolve: NonNullable<CanvasConnectionOptions["resolve"]>;
  constructor(private readonly options: CanvasConnectionOptions) {
    let base: URL;
    try { base = new URL(options.baseUrl); }
    catch { throw new CanvasError("Configure a valid HTTPS Canvas base URL."); }
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || (base.pathname !== "/" && base.pathname !== "")) throw new CanvasError("Canvas base URL must be an HTTPS institution origin.");
    this.origin = base.origin;
    this.request = options.request ?? fetch;
    this.resolve = options.resolve ?? ((hostname) => lookup(hostname, { all: true, verbatim: true }));
  }
  get configured() { return Boolean(this.options.token?.trim()); }
  courseUrl(value: string) {
    let url: URL;
    try { url = new URL(value); } catch { throw new CanvasError("Paste a valid Canvas course URL."); }
    const id = url.pathname.match(/^\/courses\/(\d+)(?:\/|$)/)?.[1];
    if (url.origin !== this.origin || url.username || url.password || !id) throw new CanvasError(`Choose a course URL on the configured Canvas institution: ${this.origin}.`);
    return { id, url: `${this.origin}/courses/${id}` };
  }
  private apiUrl(value: string) {
    const url = new URL(value, this.origin);
    if (url.origin !== this.origin || url.username || url.password || !url.pathname.startsWith("/api/v1/")) throw new CanvasError("Canvas returned an unexpected API destination.");
    url.searchParams.delete("access_token");
    return url;
  }
  private async networkUrl(url: URL) {
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new CanvasError("Canvas resources must use public HTTPS destinations.");
    const addresses = await this.resolve(url.hostname);
    if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw new CanvasError("Canvas resources cannot access private or local network destinations.");
  }
  private async send(url: URL, authenticated: boolean, accept = "application/json"): Promise<Response> {
    if (authenticated && !this.configured) throw new CanvasError("Set CANVAS_ACCESS_TOKEN on the local server before importing a class.", 503);
    await this.networkUrl(url);
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await this.request(url, {
          method: "GET", redirect: "manual", signal: AbortSignal.timeout(60_000),
          headers: authenticated ? { Authorization: `Bearer ${this.options.token}`, Accept: accept } : {},
        });
        if ((response.status === 429 || response.status === 503) && attempt < 2) {
          const delay = Math.min(5, Math.max(1, Number(response.headers.get("retry-after")) || 2 ** attempt));
          await response.body?.cancel();
          await new Promise((resolve) => setTimeout(resolve, delay * 1000));
          continue;
        }
        return response;
      }
      throw new CanvasError("Canvas is temporarily unavailable. Try again later.", 503);
    } catch (error) {
      if (error instanceof CanvasError) throw error;
      throw new CanvasError("The Canvas connection failed or timed out. Check the connection and try again.", 502);
    }
  }
  async get(path: string): Promise<{ data: unknown; link: string | null }> {
    const response = await this.send(this.apiUrl(path), true);
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401) throw new CanvasError("Canvas rejected the API token. Update the token for this institution and try again.", 401);
      if ([403, 404].includes(response.status)) throw new CanvasError("This Canvas resource is unavailable to your account.", response.status);
      if (response.status === 429) throw new CanvasError("Canvas is rate limiting this import. Wait and retry.", 429);
      throw new CanvasError(`Canvas returned HTTP ${response.status}.`, 502);
    }
    const buffer = await readBounded(response, 10 * 1024 * 1024);
    try { return { data: JSON.parse(buffer.toString("utf8")) as unknown, link: response.headers.get("link") }; }
    catch { throw new CanvasError("Canvas did not return valid API data.", 502); }
  }
  async list(path: string) {
    const items: unknown[] = [];
    const visited = new Set<string>();
    let next: string | undefined = path;
    while (next) {
      const url = this.apiUrl(next).href;
      if (visited.has(url) || visited.size >= 100) throw new CanvasError("Canvas pagination exceeded the import limit. Import a smaller selection.");
      visited.add(url);
      const result = await this.get(url);
      if (!Array.isArray(result.data)) throw new CanvasError("Canvas returned an invalid resource list.", 502);
      items.push(...result.data);
      if (items.length > 10_000) throw new CanvasError("This course exceeds the 10,000-resource discovery limit.");
      next = result.link?.split(",").find((part) => /rel="next"/.test(part))?.match(/<([^>]+)>/)?.[1];
    }
    return items;
  }
  async download(value: string) {
    let url: URL;
    try { url = new URL(value, this.origin); } catch { throw new CanvasError("Canvas did not provide a valid file URL."); }
    for (let hop = 0; hop < 6; hop += 1) {
      const host = url.hostname;
      const allowed = ["instructure.com", "inscloudgate.net", "instructureusercontent.com", "canvas-user-content.com", "amazonaws.com"];
      if (url.origin !== this.origin && !allowed.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) throw new CanvasError("This file uses a download provider that is not supported yet.");
      url.searchParams.delete("access_token");
      const response = await this.send(url, url.origin === this.origin, "*/*");
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new CanvasError("Canvas returned an incomplete download redirect.");
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new CanvasError(`The file download returned HTTP ${response.status}.`); }
      if (/text\/html|application\/json/i.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel(); throw new CanvasError("Canvas returned a login or error page instead of a file."); }
      return readBounded(response, 50 * 1024 * 1024);
    }
    throw new CanvasError("The file download exceeded the redirect limit.");
  }
}
