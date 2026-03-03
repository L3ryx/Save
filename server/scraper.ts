import { type Product, type ScrapeResponse, aliexpressCategories } from "@shared/schema";
import { log } from "./index";

const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY;

const categorySlugMap: Record<string, string> = {
  "44": "phones-telecommunications",
  "509": "computer-office",
  "7": "consumer-electronics",
  "320": "toys-hobbies",
  "2": "home-garden",
  "36": "sports-entertainment",
  "1501": "mother-kids",
  "6": "home-appliances",
  "1524": "fashion-accessories",
  "200003655": "beauty-health",
  "34": "automobiles-motorcycles",
  "30": "jewelry-accessories",
  "100003109": "tools",
  "1503": "shoes-bags",
  "200003482": "womens-clothing",
  "200000532": "mens-clothing",
};

function buildCategoryUrl(categoryId: string, sortBy: string, page: number): string {
  const slug = categorySlugMap[categoryId] || "all";
  let sortParam = "";
  switch (sortBy) {
    case "orders":
      sortParam = "&SortType=total_tranpro_desc";
      break;
    case "price_asc":
      sortParam = "&SortType=price_asc";
      break;
    case "price_desc":
      sortParam = "&SortType=price_desc";
      break;
    case "rating":
      sortParam = "&SortType=evaluationScore_desc";
      break;
    default:
      sortParam = "&SortType=total_tranpro_desc";
  }
  return `https://www.aliexpress.com/category/${categoryId}/${slug}.html?page=${page}${sortParam}&g=y`;
}

function extractProductsFromHtml(html: string): Product[] {
  const products: Product[] = [];
  const seen = new Set<string>();

  const productBlockRegex = /"productId"\s*:\s*"(\d+)"([\s\S]*?)(?="productId"\s*:\s*"|\]\s*[,}]|$)/g;
  let blockMatch;

  while ((blockMatch = productBlockRegex.exec(html)) !== null) {
    const id = blockMatch[1];
    if (seen.has(id)) continue;
    seen.add(id);

    const block = blockMatch[2].substring(0, 2000);

    let title = "";
    const titleMatch = block.match(/"displayTitle"\s*:\s*"([^"]+)"/);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]*>/g, "");
    }
    if (!title) {
      const seoTitleMatch = block.match(/"seoTitle"\s*:\s*"([^"]+)"/);
      if (seoTitleMatch) title = seoTitleMatch[1].replace(/<[^>]*>/g, "");
    }

    let imageUrl = "";
    const imgMatch = block.match(/"imgUrl"\s*:\s*"([^"]+)"/);
    if (imgMatch) {
      imageUrl = imgMatch[1].startsWith("//") ? `https:${imgMatch[1]}` : imgMatch[1];
    }

    let salePrice = "";
    const salePriceMatch = block.match(/"salePrice"\s*:\{[^}]*?"formattedPrice"\s*:\s*"([^"]+)"/);
    if (salePriceMatch) {
      salePrice = salePriceMatch[1];
    }
    if (!salePrice) {
      const minPriceMatch = block.match(/"salePrice"\s*:\{[^}]*?"minPrice"\s*:\s*([\d.]+)/);
      if (minPriceMatch) salePrice = `US $${minPriceMatch[1]}`;
    }

    let originalPrice = "";
    const origPriceMatch = block.match(/"originalPrice"\s*:\{[^}]*?"formattedPrice"\s*:\s*"([^"]+)"/);
    if (origPriceMatch) {
      originalPrice = origPriceMatch[1];
    }

    let orders = "";
    const tradeMatch = block.match(/"tradeDesc"\s*:\s*"([^"]+)"/);
    if (tradeMatch) {
      orders = tradeMatch[1];
    }

    let rating = "";
    const ratingMatch = block.match(/"starRating"\s*:\s*"?([0-9.]+)"?/);
    if (ratingMatch) {
      rating = ratingMatch[1];
    }
    if (!rating) {
      const evalMatch = block.match(/"averageStar"\s*:\s*"?([0-9.]+)"?/);
      if (evalMatch) rating = evalMatch[1];
    }

    let store = "";
    const storeMatch = block.match(/"storeName"\s*:\s*"([^"]+)"/);
    if (storeMatch) {
      store = storeMatch[1];
    }

    let discount = "";
    const discountMatch = block.match(/"discount"\s*:\s*"?(\d+)"?/);
    if (discountMatch) {
      discount = `-${discountMatch[1]}%`;
    }

    const productUrl = `https://www.aliexpress.com/item/${id}.html`;

    if (title && title.length > 3) {
      products.push({
        id,
        title,
        price: salePrice || "Price unavailable",
        originalPrice: originalPrice || undefined,
        discount: discount || undefined,
        rating: rating || undefined,
        orders: orders || undefined,
        imageUrl,
        productUrl,
        store: store || undefined,
      });
    }
  }

  return products;
}

async function fetchWithScraperApi(url: string, useRender: boolean, timeoutMs: number): Promise<string> {
  const params = new URLSearchParams({
    api_key: SCRAPERAPI_KEY!,
    url,
    country_code: "us",
  });
  if (useRender) {
    params.set("render", "true");
  }

  const scraperUrl = `https://api.scraperapi.com?${params.toString()}`;
  const startTime = Date.now();

  const response = await fetch(scraperUrl, {
    method: "GET",
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const elapsed = Date.now() - startTime;
  log(`ScraperAPI responded in ${elapsed}ms (render=${useRender})`, "scraper");

  if (!response.ok) {
    throw new Error(`ScraperAPI returned ${response.status}: ${response.statusText}`);
  }

  return await response.text();
}

export async function scrapeAliexpress(
  categoryId: string,
  sortBy: string = "orders",
  page: number = 1
): Promise<ScrapeResponse> {
  if (!SCRAPERAPI_KEY) {
    throw new Error("SCRAPERAPI_KEY is not configured");
  }

  const category = aliexpressCategories.find(c => c.id === categoryId);
  const categoryName = category?.name || "Unknown Category";
  const targetUrl = buildCategoryUrl(categoryId, sortBy, page);

  log(`Scraping category page (rendered): ${targetUrl}`, "scraper");

  const html = await fetchWithScraperApi(targetUrl, true, 90000);
  log(`Received ${html.length} bytes`, "scraper");

  const products = extractProductsFromHtml(html);
  log(`Found ${products.length} products from ${categoryName}`, "scraper");

  return {
    products,
    category: categoryName,
    totalFound: products.length,
    scrapedAt: new Date().toISOString(),
  };
}
