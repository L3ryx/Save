import { type EtsyProduct } from "@shared/schema";
import { log } from "./index";

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;

async function fetchWithScrapingBeeAI(url: string, aiQuery: string, extractRules: object): Promise<any> {
  if (!SCRAPINGBEE_API_KEY) {
    throw new Error("SCRAPINGBEE_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_API_KEY,
    url,
    render_js: "true",
    premium_proxy: "true",
    country_code: "us",
    ai_query: aiQuery,
    ai_extract_rules: JSON.stringify(extractRules),
  });

  const apiUrl = `https://app.scrapingbee.com/api/v1?${params.toString()}`;
  log(`ScrapingBee AI request: ${url}`, "etsy");

  const response = await fetch(apiUrl, {
    method: "GET",
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ScrapingBee returned ${response.status}: ${text.substring(0, 300)}`);
  }

  const data = await response.json();
  log(`ScrapingBee AI returned data`, "etsy");
  return data;
}

async function fetchWithScrapingBeeRaw(url: string): Promise<string> {
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
  log(`ScrapingBee raw request: ${url}`, "etsy");

  const response = await fetch(apiUrl, {
    method: "GET",
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ScrapingBee returned ${response.status}: ${text.substring(0, 300)}`);
  }

  return await response.text();
}

function extractEtsyProductsFallback(html: string): EtsyProduct[] {
  const products: EtsyProduct[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  const listingIds: string[] = [];
  const listingRegex = /data-listing-id="(\d+)"/g;
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

  const titleMap = new Map<string, string>();
  const altTitleRegex = /listing\/(\d+)\/([^?"]+)/g;
  while ((m = altTitleRegex.exec(html)) !== null) {
    if (!titleMap.has(m[1])) {
      const title = decodeURIComponent(m[2]).replace(/-/g, " ").replace(/\s+/g, " ").trim();
      if (title.length > 3) titleMap.set(m[1], title);
    }
  }

  const globalImgs: string[] = [];
  const imgExtract = /src="(https:\/\/i\.etsystatic\.com\/\d+\/[^"]+)"/g;
  while ((m = imgExtract.exec(html)) !== null) {
    if (!m[1].includes("icon") && !m[1].includes("logo") && !m[1].includes("avatar")) {
      globalImgs.push(m[1]);
    }
  }

  const globalPrices: string[] = [];
  const priceExtract = /class="[^"]*currency-value[^"]*"[^>]*>(\d+[\.,]\d{2})/g;
  while ((m = priceExtract.exec(html)) !== null) {
    globalPrices.push(m[1]);
  }

  for (let i = 0; i < listingIds.length; i++) {
    const id = listingIds[i];
    const title = titleMap.get(id) || "";
    if (!title || title.length < 3) continue;

    products.push({
      id,
      title,
      price: globalPrices[i] ? `$${globalPrices[i]}` : "Price unavailable",
      imageUrl: globalImgs[i] || "",
      productUrl: `https://www.etsy.com/listing/${id}`,
    });
  }

  return products;
}

export async function scrapeEtsy(keyword: string, maxResults: number = 24): Promise<EtsyProduct[]> {
  const encodedKeyword = encodeURIComponent(keyword);
  const url = `https://www.etsy.com/search?q=${encodedKeyword}&ref=search_bar`;

  try {
    const extractRules = {
      products: {
        description: "List of all product listings visible on this Etsy search results page",
        type: "list",
        output: {
          title: "The full product title/name",
          price: "The product price including currency symbol",
          image_url: "The main product image URL (full https URL)",
          product_url: "The full URL link to the product listing page",
          shop_name: "The name of the shop selling this product",
          listing_id: "The Etsy listing ID number from the URL or data attributes",
        },
      },
    };

    const data = await fetchWithScrapingBeeAI(
      url,
      "Extract all product listings from this Etsy search results page. For each product, get the title, price, image URL, product link, shop name, and listing ID.",
      extractRules
    );

    log(`AI extraction returned: ${JSON.stringify(data).substring(0, 500)}`, "etsy");

    const productList = data?.products || [];
    const products: EtsyProduct[] = [];
    const seen = new Set<string>();

    for (const item of productList) {
      if (!item.title || item.title.length < 3) continue;

      let id = String(item.listing_id || "");
      if (!id) {
        const idMatch = (item.product_url || "").match(/listing\/(\d+)/);
        id = idMatch ? idMatch[1] : `etsy-${products.length}`;
      }
      if (seen.has(id)) continue;
      seen.add(id);

      let imageUrl = item.image_url || "";
      if (imageUrl.startsWith("//")) imageUrl = `https:${imageUrl}`;

      let productUrl = item.product_url || "";
      if (productUrl && !productUrl.startsWith("http")) {
        productUrl = `https://www.etsy.com${productUrl.startsWith("/") ? "" : "/"}${productUrl}`;
      }
      if (!productUrl) productUrl = `https://www.etsy.com/listing/${id}`;

      products.push({
        id,
        title: item.title,
        price: item.price || "Price unavailable",
        imageUrl,
        productUrl,
        shop: item.shop_name,
      });

      if (products.length >= maxResults) break;
    }

    if (products.length > 0) {
      log(`AI extraction found ${products.length} Etsy products`, "etsy");
      return products;
    }

    log("AI extraction returned no products, trying fallback", "etsy");
  } catch (error: any) {
    log(`AI extraction failed: ${error.message}, trying fallback`, "etsy");
  }

  const html = await fetchWithScrapingBeeRaw(url);
  const fallbackProducts = extractEtsyProductsFallback(html);
  log(`Fallback extraction found ${fallbackProducts.length} products`, "etsy");
  return fallbackProducts.slice(0, maxResults);
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

  return words.slice(0, 5).join(" ") || title.substring(0, 40);
}

function parsePrice(priceStr: string): number {
  const match = priceStr.replace(/[,\s]/g, "").match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}

export function scoreMatch(etsyTitle: string, etsyPrice: string, aliTitle: string, aliPrice: string): number {
  const etsyWords = etsyTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);

  const aliWords = aliTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);

  let wordMatches = 0;
  for (const word of etsyWords) {
    if (aliWords.some(aw => aw.includes(word) || word.includes(aw))) {
      wordMatches++;
    }
  }
  const titleScore = etsyWords.length > 0 ? wordMatches / etsyWords.length : 0;

  const etsyP = parsePrice(etsyPrice);
  const aliP = parsePrice(aliPrice);
  let priceScore = 0;
  if (etsyP > 0 && aliP > 0) {
    const ratio = etsyP / aliP;
    if (ratio >= 2 && ratio <= 20) {
      priceScore = 0.3;
    } else if (ratio >= 1.5 && ratio <= 30) {
      priceScore = 0.15;
    }
  }

  return Math.min(titleScore + priceScore, 1.0);
}
