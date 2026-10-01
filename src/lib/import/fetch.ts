import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;

export class ImportError extends Error {}

/** Loopback, private, link-local, CGNAT, multicast… (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return (
    v6 === "::" || v6 === "::1" ||
    v6.startsWith("fc") || v6.startsWith("fd") || // unique local
    v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || // link-local
    v6.startsWith("ff") // multicast
  );
}

/** Refuses non-http(s) URLs and hosts resolving to internal addresses (SSRF). */
async function assertPublicUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ImportError("Seules les adresses http(s) sont acceptées.");
  }
  if (process.env.IMPORT_ALLOW_PRIVATE === "1") return; // tests / local dev only
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = net.isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new ImportError("Site introuvable : vérifie l'adresse.");
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new ImportError("Cette adresse n'est pas autorisée.");
  }
}

function charsetOf(contentType: string | null, head: string): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  const charset = (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
  try {
    new TextDecoder(charset);
    return charset;
  } catch {
    return "utf-8";
  }
}

/** Downloads a public web page as text. Throws ImportError with a French message. */
export async function fetchPage(rawUrl: string): Promise<{ html: string; finalUrl: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new ImportError("Adresse invalide.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(url);
      res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
        },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      break;
    }
    if (!res || (res.status >= 300 && res.status < 400)) throw new ImportError("Trop de redirections.");
    if (res.status === 403 || res.status === 429) {
      throw new ImportError("Le site refuse l'accès automatique. Copie le texte de la recette et utilise « Coller un texte ».");
    }
    if (!res.ok) throw new ImportError(`Page inaccessible (erreur ${res.status}).`);
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) throw new ImportError("Ce lien ne pointe pas vers une page web.");

    // Read with a size cap.
    const reader = res.body?.getReader();
    if (!reader) throw new ImportError("Page vide.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break; // the recipe is almost always near the top: keep what we have
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    const head = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
    const html = new TextDecoder(charsetOf(type, head)).decode(bytes);
    return { html, finalUrl: url.toString() };
  } catch (e) {
    if (e instanceof ImportError) throw e;
    if (controller.signal.aborted) throw new ImportError("Le site met trop de temps à répondre.");
    throw new ImportError("Impossible de récupérer la page.");
  } finally {
    clearTimeout(timer);
  }
}
