import { log } from "./index";

const ZENSERP_API_KEY = process.env.ZENSERP_API_KEY;

export interface ZenserpImageResult {
  position: number;
  thumbnail: string;
  sourceUrl: string | null;
  title: string;
  link: string;
  source: string;
}

export async function searchImagesByQuery(query: string, num: number = 10): Promise<ZenserpImageResult[]> {
  if (!ZENSERP_API_KEY) {
    throw new Error("ZENSERP_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    apikey: ZENSERP_API_KEY,
    q: query,
    tbm: "isch",
    num: String(num),
  });

  const url = `https://app.zenserp.com/api/v2/search?${params.toString()}`;
  log(`Zenserp image search: "${query}"`, "zenserp");

  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zenserp returned ${response.status}: ${text.substring(0, 300)}`);
  }

  const data = await response.json();
  const results: ZenserpImageResult[] = data.image_results || [];
  log(`Zenserp returned ${results.length} image results for "${query}"`, "zenserp");
  return results;
}

export function findAliexpressFromImageResults(results: ZenserpImageResult[]): ZenserpImageResult[] {
  const aliDomains = [
    "aliexpress.com",
    "aliexpress.us",
    "ali.ski",
    "aliyun.com",
    "1688.com",
    "alibaba.com",
    "dhgate.com",
    "wish.com",
    "banggood.com",
    "gearbest.com",
    "lightinthebox.com",
    "miniinthebox.com",
    "tomtop.com",
    "dx.com",
  ];

  return results.filter(r => {
    const link = (r.link || "").toLowerCase();
    const source = (r.source || "").toLowerCase();
    return aliDomains.some(domain => link.includes(domain) || source.includes(domain));
  });
}

export function extractProductInfoFromImageResult(result: ZenserpImageResult): {
  title: string;
  imageUrl: string;
  productUrl: string;
  source: string;
} {
  return {
    title: result.title || "",
    imageUrl: result.thumbnail || "",
    productUrl: result.link || "",
    source: result.source || "",
  };
}
