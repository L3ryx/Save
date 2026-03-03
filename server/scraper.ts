import { type Product, type ScrapeResponse, aliexpressCategories } from "@shared/schema";
import { log } from "./index";

const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY;

const categorySearchTerms: Record<string, string> = {
  "44": "phones",
  "509": "computer-office",
  "7": "electronics",
  "320": "toys",
  "2": "home-garden",
  "36": "sports",
  "1501": "mother-kids",
  "6": "home-appliances",
  "1524": "fashion-accessories",
  "200003655": "beauty-health",
  "34": "automobiles",
  "30": "jewelry",
  "100003109": "tools",
  "1503": "bags-shoes",
  "200003482": "womens-clothing",
  "200000532": "mens-clothing",
};

function buildSearchUrl(categoryId: string, sortBy: string, page: number): string {
  const term = categorySearchTerms[categoryId] || "products";
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
  return `https://www.aliexpress.com/w/wholesale-${term}.html?catId=${categoryId}${sortParam}&page=${page}&g=y`;
}

function extractProductsFromHtml(html: string): Product[] {
  const products: Product[] = [];
  const seen = new Set<string>();

  const productBlockRegex = /"productId"\s*:\s*"(\d+)"([\s\S]*?)(?="productId"\s*:\s*"|"redirectedId"\s*:\s*"|$)/g;
  let blockMatch;

  while ((blockMatch = productBlockRegex.exec(html)) !== null) {
    const id = blockMatch[1];
    if (seen.has(id)) continue;
    seen.add(id);

    const block = blockMatch[2].substring(0, 8000);

    let title = "";
    const titleMatch = block.match(/"displayTitle"\s*:\s*"([^"]+)"/);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]*>/g, "");
    }
    if (!title) {
      const seoMatch = block.match(/"seoTitle"\s*:\s*"([^"]+)"/);
      if (seoMatch) title = seoMatch[1].replace(/<[^>]*>/g, "");
    }
    if (!title) {
      const plainMatch = block.match(/"title"\s*:\s*"([^"]{5,200})"/);
      if (plainMatch) title = plainMatch[1].replace(/<[^>]*>/g, "");
    }

    let imageUrl = "";
    const imgMatch = block.match(/"imgUrl"\s*:\s*"([^"]+)"/);
    if (imgMatch) {
      imageUrl = imgMatch[1].startsWith("//") ? `https:${imgMatch[1]}` : imgMatch[1];
    }

    let salePrice = "";
    const salePriceMatch = block.match(/"salePrice"\s*:\s*\{[^}]*?"formattedPrice"\s*:\s*"([^"]+)"/);
    if (salePriceMatch) {
      salePrice = salePriceMatch[1];
    }
    if (!salePrice) {
      const minPriceMatch = block.match(/"salePrice"\s*:\s*\{[^}]*?"minPrice"\s*:\s*([\d.]+)/);
      if (minPriceMatch) salePrice = `US $${minPriceMatch[1]}`;
    }
    if (!salePrice) {
      const anyPriceMatch = block.match(/"formattedPrice"\s*:\s*"([^"]+)"/);
      if (anyPriceMatch) salePrice = anyPriceMatch[1];
    }
    if (!salePrice) {
      const centMatch = block.match(/"minPriceCent"\s*:\s*(\d+)/);
      if (centMatch) salePrice = `US $${(parseInt(centMatch[1]) / 100).toFixed(2)}`;
    }

    let originalPrice = "";
    const origPriceMatch = block.match(/"originalPrice"\s*:\s*\{[^}]*?"formattedPrice"\s*:\s*"([^"]+)"/);
    if (origPriceMatch) {
      originalPrice = origPriceMatch[1];
    }

    let orders = "";
    const tradeMatch = block.match(/"tradeDesc"\s*:\s*"([^"]+)"/);
    if (tradeMatch) {
      orders = tradeMatch[1];
    }
    if (!orders) {
      const soldMatch = block.match(/"sold"\s*:\s*"?(\d+)"?/);
      if (soldMatch) orders = `${soldMatch[1]} sold`;
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

    let productUrl = `https://www.aliexpress.com/item/${id}.html`;
    const urlMatch = block.match(/"productDetailUrl"\s*:\s*"([^"]+)"/);
    if (urlMatch) {
      const u = urlMatch[1];
      productUrl = u.startsWith("//") ? `https:${u}` : u.startsWith("http") ? u : productUrl;
    }

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

  if (products.length === 0) {
    const linkRegex = /href="((?:https?:)?\/\/(?:www\.)?aliexpress\.(?:com|us)\/item\/(\d+)\.html[^"]*)"/g;
    const titleRegex = /<(?:h[1-6]|span|div|a)[^>]*class="[^"]*(?:title|name|subject)[^"]*"[^>]*>([^<]{5,200})<\//gi;
    const priceRegex = /US\s*\$\s*(\d+[\.,]\d{0,2})/gi;
    const imgRegex = /(?:src|data-src)="((?:https?:)?\/\/[^"]*(?:alicdn|aliexpress-media)[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;

    const links: { url: string; id: string }[] = [];
    const titles: string[] = [];
    const prices: string[] = [];
    const images: string[] = [];

    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const url = m[1].startsWith("//") ? `https:${m[1]}` : m[1];
      if (!links.find(l => l.id === m[2])) {
        links.push({ url, id: m[2] });
      }
    }

    while ((m = titleRegex.exec(html)) !== null) {
      const t = m[1].trim();
      if (t.length > 5 && t.length < 200) titles.push(t);
    }

    while ((m = priceRegex.exec(html)) !== null) {
      prices.push(`US $${m[1]}`);
    }

    while ((m = imgRegex.exec(html)) !== null) {
      const url = m[1].startsWith("//") ? `https:${m[1]}` : m[1];
      if (!url.includes("icon") && !url.includes("logo") && !url.includes("sprite") && !url.includes("banner")) {
        images.push(url);
      }
    }

    const count = Math.min(links.length, titles.length);
    for (let i = 0; i < count; i++) {
      products.push({
        id: links[i].id,
        title: titles[i],
        price: prices[i] || "Price unavailable",
        imageUrl: images[i] || "",
        productUrl: links[i].url,
      });
    }
  }

  return products.filter(p => p.title && p.title.length > 3);
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
  const targetUrl = buildSearchUrl(categoryId, sortBy, page);

  log(`Scraping: ${targetUrl}`, "scraper");

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
