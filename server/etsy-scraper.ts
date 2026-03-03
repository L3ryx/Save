import { type EtsyProduct } from "@shared/schema";
import { log } from "./index";

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;

function extractEtsyProducts(html: string): EtsyProduct[] {
  const products: EtsyProduct[] = [];
  const seen = new Set<string>();

  const listingRegex = /data-listing-id="(\d+)"/g;
  const listingIds: string[] = [];
  let m;
  while ((m = listingRegex.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      listingIds.push(m[1]);
    }
  }

  if (listingIds.length === 0) {
    const altRegex = /listing\/(\d+)\//g;
    while ((m = altRegex.exec(html)) !== null) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        listingIds.push(m[1]);
      }
    }
  }

  log(`Found ${listingIds.length} listing IDs on Etsy`, "etsy");

  const titleRegex = /data-listing-id="(\d+)"[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/g;
  const titleMap = new Map<string, string>();
  while ((m = titleRegex.exec(html)) !== null) {
    titleMap.set(m[1], m[2].trim());
  }

  if (titleMap.size === 0) {
    const altTitleRegex = /listing\/(\d+)\/([^?"]+)/g;
    while ((m = altTitleRegex.exec(html)) !== null) {
      if (!titleMap.has(m[1])) {
        const title = decodeURIComponent(m[2]).replace(/-/g, " ").replace(/\s+/g, " ").trim();
        if (title.length > 3) {
          titleMap.set(m[1], title);
        }
      }
    }
  }

  const priceRegex = /data-listing-id="(\d+)"[\s\S]*?(?:currency-value|sale-price)[^>]*>([^<]*\d+[\.,]\d{2})/g;
  const priceMap = new Map<string, string>();
  while ((m = priceRegex.exec(html)) !== null) {
    if (!priceMap.has(m[1])) {
      priceMap.set(m[1], m[2].trim());
    }
  }

  const globalPrices: string[] = [];
  const priceExtract = /class="[^"]*currency-value[^"]*"[^>]*>(\d+[\.,]\d{2})/g;
  while ((m = priceExtract.exec(html)) !== null) {
    globalPrices.push(m[1]);
  }
  if (globalPrices.length === 0) {
    const altPriceExtract = /(\d+[\.,]\d{2})\s*(?:USD|EUR|GBP|\$|€|£)/g;
    while ((m = altPriceExtract.exec(html)) !== null) {
      globalPrices.push(m[1]);
    }
  }

  const imgRegex = /data-listing-id="(\d+)"[\s\S]*?<img[^>]*src="(https:\/\/i\.etsystatic\.com\/[^"]+)"/g;
  const imgMap = new Map<string, string>();
  while ((m = imgRegex.exec(html)) !== null) {
    if (!imgMap.has(m[1])) {
      imgMap.set(m[1], m[2]);
    }
  }

  const globalImgs: string[] = [];
  const imgExtract = /src="(https:\/\/i\.etsystatic\.com\/\d+\/[^"]+)"/g;
  while ((m = imgExtract.exec(html)) !== null) {
    if (!m[1].includes("icon") && !m[1].includes("logo") && !m[1].includes("avatar")) {
      globalImgs.push(m[1]);
    }
  }

  const shopRegex = /data-listing-id="(\d+)"[\s\S]*?<p[^>]*shop-name[^>]*>([^<]+)<\/p>/g;
  const shopMap = new Map<string, string>();
  while ((m = shopRegex.exec(html)) !== null) {
    shopMap.set(m[1], m[2].trim());
  }

  for (let i = 0; i < listingIds.length; i++) {
    const id = listingIds[i];
    const title = titleMap.get(id) || "";
    const price = priceMap.get(id) || globalPrices[i] || "";
    const imageUrl = imgMap.get(id) || globalImgs[i] || "";
    const shop = shopMap.get(id);

    if (!title || title.length < 3) continue;

    products.push({
      id,
      title,
      price: price ? `$${price.replace(/[^0-9.,]/g, "")}` : "Price unavailable",
      imageUrl,
      productUrl: `https://www.etsy.com/listing/${id}`,
      shop,
    });
  }

  if (products.length === 0) {
    log("Primary extraction failed, trying JSON-LD extraction", "etsy");
    const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
    while ((m = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(m[1]);
        if (data["@type"] === "Product" || (Array.isArray(data) && data[0]?.["@type"] === "Product")) {
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (item.name && item.url) {
              const idMatch = item.url.match(/listing\/(\d+)/);
              const pid = idMatch ? idMatch[1] : String(products.length);
              if (seen.has(pid)) continue;
              seen.add(pid);
              products.push({
                id: pid,
                title: item.name,
                price: item.offers?.price ? `$${item.offers.price}` : "Price unavailable",
                imageUrl: item.image || "",
                productUrl: item.url,
                shop: item.brand?.name,
              });
            }
          }
        }
      } catch {}
    }
  }

  return products;
}

async function fetchWithScrapingBee(url: string): Promise<string> {
  if (!SCRAPINGBEE_API_KEY) {
    throw new Error("SCRAPINGBEE_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_API_KEY,
    url,
    render_js: "true",
    premium_proxy: "true",
    country_code: "us",
  });

  const apiUrl = `https://app.scrapingbee.com/api/v1?${params.toString()}`;
  log(`ScrapingBee request: ${url}`, "etsy");

  const response = await fetch(apiUrl, {
    method: "GET",
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ScrapingBee returned ${response.status}: ${text.substring(0, 200)}`);
  }

  const html = await response.text();
  log(`ScrapingBee returned ${html.length} bytes`, "etsy");
  return html;
}

export function extractSearchKeywords(title: string): string {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "it", "this", "that", "are", "was",
    "be", "has", "had", "have", "do", "does", "did", "will", "would",
    "can", "could", "may", "might", "shall", "should", "not", "no",
    "very", "just", "so", "up", "out", "if", "about", "into", "through",
    "during", "before", "after", "above", "below", "between", "each",
    "few", "more", "most", "other", "some", "such", "only", "own",
    "same", "than", "too", "also", "how", "all", "any", "both",
    "gift", "gifts", "personalized", "custom", "customized", "handmade",
    "unique", "cute", "beautiful", "perfect", "best", "great", "new",
    "free", "shipping", "sale", "set", "style", "design",
  ]);

  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  const keywords = words.slice(0, 5).join(" ");
  return keywords || title.substring(0, 40);
}

export async function scrapeEtsy(keyword: string, maxResults: number = 12): Promise<EtsyProduct[]> {
  const encodedKeyword = encodeURIComponent(keyword);
  const url = `https://www.etsy.com/search?q=${encodedKeyword}&ref=search_bar`;

  const html = await fetchWithScrapingBee(url);
  let products = extractEtsyProducts(html);

  if (products.length === 0) {
    const hasCaptcha = html.includes("captcha") || html.includes("robot");
    const hasBlocked = html.includes("blocked") || html.includes("Access Denied");
    log(`No Etsy products found (captcha=${hasCaptcha}, blocked=${hasBlocked})`, "etsy");
    log(`HTML snippet: ${html.substring(0, 1000)}`, "etsy");
  }

  return products.slice(0, maxResults);
}
