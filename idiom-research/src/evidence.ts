import {
  excerptAppearsInPage,
  normalizePageText,
  sourceHost,
  summarizeEvidence,
} from "./core.js";
import type { EvidenceSource, EvidenceSummary } from "./types.js";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const maxSourceBytes = 2_000_000;

export async function verifySources(
  sources: EvidenceSource[],
  options: { requireAttestedForm?: boolean } = {},
): Promise<{ sources: EvidenceSource[]; evidence: EvidenceSummary }> {
  const seenHosts = new Set<string>();
  const verified: EvidenceSource[] = [];

  for (const source of sources) {
    const result = { ...source, accessedAt: new Date().toISOString() };
    if (source.excerpt.length < 20 || source.excerpt.length > 500) {
      result.verificationError =
        "Evidence excerpts must contain between 20 and 500 characters.";
      verified.push(result);
      continue;
    }
    if (
      options.requireAttestedForm &&
      (!source.attestedForm ||
        !normalizePageText(source.excerpt).includes(
          normalizePageText(source.attestedForm),
        ))
    ) {
      result.verificationError =
        "The evidence excerpt does not contain its claimed attested idiom form.";
      verified.push(result);
      continue;
    }
    const host = sourceHost(source.url);
    if (!host) {
      result.verificationError = "Invalid source URL.";
      verified.push(result);
      continue;
    }
    if (seenHosts.has(host)) {
      result.verificationError = "Duplicate source publisher.";
      verified.push(result);
      continue;
    }
    seenHosts.add(host);

    try {
      const parsedUrl = new URL(source.url);
      if (!["http:", "https:"].includes(parsedUrl.protocol) || await isPrivateHost(parsedUrl.hostname)) {
        result.verificationError = "Source URL points to a private or unsupported destination.";
        verified.push(result);
        continue;
      }
      const response = await fetch(parsedUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "User-Agent":
            "IdiomaticallyResearchBot/1.0 (+https://idiomatically.net)",
        },
      });
      result.httpStatus = response.status;
      result.finalUrl = response.url;
      if (!response.ok) {
        result.verificationError = `Source returned HTTP ${response.status}.`;
      } else {
        const contentLength = Number(response.headers.get("content-length"));
        if (contentLength > maxSourceBytes) {
          result.verificationError = "Source page exceeded the size limit.";
        } else {
          const page = await readLimitedResponse(response, maxSourceBytes);
          result.excerptMatched = excerptAppearsInPage(source.excerpt, page);
          if (!result.excerptMatched) {
            result.verificationError =
              "The supplied evidence excerpt was not found on the page.";
          }

        }
      }
    } catch (error) {
      result.verificationError =
        error instanceof Error ? error.message : String(error);
    }
    verified.push(result);
  }

  return { sources: verified, evidence: summarizeEvidence(verified) };
}

async function isPrivateHost(hostname: string) {
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return true;
  }
  if (isIP(hostname)) {
    return isPrivateAddress(hostname);
  }
  try {
    const addresses = await lookup(hostname, { all: true });
    return addresses.some(({ address }) => isPrivateAddress(address));
  } catch {
    return true;
  }
}

function isPrivateAddress(address: string) {
  return address === "::1" ||
    address.startsWith("10.") ||
    address.startsWith("192.168.") ||
    address.startsWith("127.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
    address.startsWith("169.254.") ||
    address === "0.0.0.0" ||
    address.startsWith("fc") ||
    address.startsWith("fd") ||
    address.startsWith("fe80:");
}

async function readLimitedResponse(response: Response, maximumBytes: number) {
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("Source page exceeded the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}
