import { type EtsyProduct } from "@shared/schema";
import { log } from "./index";

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
if (!SCRAPINGBEE_API_KEY) {
  throw new Error("SCRAPINGBEE_API_KEY not configured");
}

/* =====================================================
   🔁 Cache mémoire (10 minutes)
===================================================== */
const cache = new Map<string, { data: EtsyProduct[]; ts: number }>();
const CACHE_DURATION = 10 * 60 * 1000;

/* =====================================================
   🚀 ScrapingBee Core Request (Retry + Backoff)
===================================================== */
async function scrapingBeeRequest(
  params: URLSearchParams,
  retries = 3,
  timeoutMs = 60000
): Promise<Response> {
  const baseUrl = "https://app.scrapingbee.com/api/v1";
  const apiUrl = `${baseUrl}?${params.toString()}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(apiUrl, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) return response;

      if (response.status >= 500 || response.status === 429) {
        const delay = Math.min(2000 * attempt * attempt, 10000);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      const text = await response.text();
      throw new Error(`ScrapingBee ${response.status}: ${text.slice(0, 200)}`);

    } catch (err) {
      if (attempt === retries) throw err;
      const delay = Math.min(2000 * attempt * attempt, 10000);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw new Error("ScrapingBee failed after retries");
}

/* =====================================================
   🧠 Fallback HTML Parser (rapide & économique)
===================================================== */
function extractEtsyProductsFallback(html: string): EtsyProduct[] {
  const products: EtsyProduct[] = [];
  const seen = new Set<string>();

  const listingRegex = /data-listing-id="(\d+)"/g;
  const titleRegex = /listing\/(\d+)\/([^"?]+)/g;
  const imgRegex = /src="(https:\/\/i\.etsystatic\.com\/[^"]+)"/g;
  const priceRegex = /currency-value[^>]*>(\d+[\.,]\d{2})/g;

  const ids: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = listingRegex.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }

  const titles = new Map<string, string>();
  while ((m = titleRegex.exec(html)) !== null) {
    if (!titles.has(m[1])) {
      const clean = decodeURIComponent(m[2])
        .replace(/-/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (clean.length > 3) titles.set(m[1], clean);
    }
  }

  const images: string[] = [];
  while ((m = imgRegex.exec(html)) !== null) {
    images.push(m[1]);
  }

  const prices: string[] = [];
  while ((m = priceRegex.exec(html)) !== null) {
    prices.push(`$${m[1]}`);
  }

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const title = titles.get(id);
    if (!title) continue;

    products.push({
      id,
      title,
      price: prices[i] || "N/A",
      imageUrl: images[i] || "",
      productUrl: `https://www.etsy.com/listing/${id}`,
    });
  }

  return products;
}

/* =====================================================
   🛍️ MAIN SCRAPER
===================================================== */
export async function scrapeEtsy(
  keyword: string,
  maxResults = 24
): Promise<EtsyProduct[]> {

  const cached = cache.get(keyword);
  if (cached && Date.now() - cached.ts < CACHE_DURATION) {
    log("Using cached results", "etsy");
    return cached.data.slice(0, maxResults);
  }

  const encodedKeyword = encodeURIComponent(keyword);
  const url = `https://www.etsy.com/search?q=${encodedKeyword}`;

  /* =============================
     1️⃣ RAW SANS JS (économique)
  ============================= */
  try {
    const rawParams = new URLSearchParams({
      api_key: SCRAPINGBEE_API_KEY,
      url,
      render_js: "false",
      premium_proxy: "true",
      country_code: "us",
    });

    const rawResponse = await scrapingBeeRequest(rawParams);
    const html = await rawResponse.text();
    const products = extractEtsyProductsFallback(html);

    if (products.length >= 8) {
      cache.set(keyword, { data: products, ts: Date.now() });
      log(`Raw scrape success (${products.length})`, "etsy");
      return products.slice(0, maxResults);
    }

  } catch (err) {
    log("Raw scrape failed → switching to AI", "etsy");
  }

  /* =============================
     2️⃣ AI EXTRACTION
  ============================= */
  try {
    const aiParams = new URLSearchParams({
      api_key: SCRAPINGBEE_API_KEY,
      url,
      render_js: "true",
      premium_proxy: "true",
      country_code: "us",
      ai_query:
        "Extract all visible Etsy product listings with title, price, image_url, product_url, shop_name and listing_id.",
      ai_extract_rules: JSON.stringify({
        products: {
          type: "list",
          output: {
            title: "product title",
            price: "price with currency",
            image_url: "main image full url",
            product_url: "product link",
            shop_name: "shop name",
            listing_id: "listing id",
          },
        },
      }),
    });

    const aiResponse = await scrapingBeeRequest(aiParams, 2, 70000);
    const data = await aiResponse.json();
    const list = data?.products || [];

    if (!Array.isArray(list)) throw new Error("Invalid AI structure");

    const seen = new Set<string>();
    const products: EtsyProduct[] = [];

    for (const item of list) {
      const id =
        item.listing_id ||
        item.product_url?.match(/listing\/(\d+)/)?.[1];

      if (!id || seen.has(id)) continue;
      seen.add(id);

      products.push({
        id,
        title: item.title,
        price: item.price || "N/A",
        imageUrl: item.image_url?.startsWith("//")
          ? `https:${item.image_url}`
          : item.image_url,
        productUrl: item.product_url?.startsWith("http")
          ? item.product_url
          : `https://www.etsy.com/listing/${id}`,
        shop: item.shop_name,
      });

      if (products.length >= maxResults) break;
    }

    cache.set(keyword, { data: products, ts: Date.now() });
    log(`AI scrape success (${products.length})`, "etsy");

    return products;

  } catch (err) {
    log("AI scrape failed completely", "etsy");
    return [];
  }
}

/* =====================================================
   🔐 Protection serveur (anti crash production)
===================================================== */
process.on("unhandledRejection", err => {
  console.error("UnhandledRejection:", err);
});

process.on("uncaughtException", err => {
  console.error("UncaughtException:", err);
});
export function extractSearchKeywords(title: string): string {
  const stopWords = new Set([
    "the","a","an","and","or","but","in","on","at","to","for",
    "of","with","by","from","is","it","this","that","are","was",
    "be","has","had","have","do","does","did","will","would",
    "can","could","may","might","shall","should","not","no",
    "very","just","so","up","out","if","about","into","through",
    "during","before","after","above","below","between","each",
    "few","more","most","other","some","such","only","own",
    "same","than","too","also","how","all","any","both"
  ]);
const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  return words.slice(0, 5).join(" ") || title.slice(0, 40);
}
