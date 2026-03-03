import { type Product, type ScrapeResponse, aliexpressCategories } from "@shared/schema";
import { log } from "./index";

const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY;

function buildAliexpressUrl(categoryId: string, sortBy: string, page: number): string {
  let sortParam = "";
  switch (sortBy) {
    case "orders":
      sortParam = "total_tranpro_desc";
      break;
    case "price_asc":
      sortParam = "price_asc";
      break;
    case "price_desc":
      sortParam = "price_desc";
      break;
    case "rating":
      sortParam = "evaluationScore_desc";
      break;
    default:
      sortParam = "total_tranpro_desc";
  }
  return `https://www.aliexpress.com/w/wholesale.html?catId=${categoryId}&SortType=${sortParam}&page=${page}&g=y`;
}

function buildAliexpressApiUrl(categoryId: string, sortBy: string, page: number): string {
  let sortParam = "";
  switch (sortBy) {
    case "orders":
      sortParam = "total_tranpro_desc";
      break;
    case "price_asc":
      sortParam = "price_asc";
      break;
    case "price_desc":
      sortParam = "price_desc";
      break;
    case "rating":
      sortParam = "evaluationScore_desc";
      break;
    default:
      sortParam = "total_tranpro_desc";
  }
  return `https://www.aliexpress.com/glosearch/api/product?catId=${categoryId}&SortType=${sortParam}&page=${page}&trafficChannel=main&SearchText=&ltype=wholesale`;
}

function parseProductsFromJson(data: any): Product[] {
  const products: Product[] = [];
  try {
    const items = data?.data?.root?.fields?.mods?.itemList?.content || 
                  data?.items || 
                  data?.data?.items ||
                  data?.result?.resultList ||
                  [];

    for (const item of items) {
      const productId = item.productId || item.itemId || item.product_id || "";
      const title = item.title?.seoTitle || item.title?.displayTitle || item.title || item.name || "";
      const priceInfo = item.prices?.salePrice?.formattedPrice || 
                       item.prices?.salePrice?.minPrice ||
                       item.price?.formattedPrice ||
                       item.price ||
                       "";
      const originalPrice = item.prices?.originalPrice?.formattedPrice || 
                           item.prices?.originalPrice?.minPrice || "";
      const discount = item.prices?.discount || item.discount || "";
      const imageUrl = item.image?.imgUrl || item.imageUrl || item.img || "";
      const orders = item.trade?.tradeDesc || item.orders || item.sold || "";
      const rating = item.evaluation?.starRating || item.rating || "";
      const store = item.store?.storeName || item.store || "";
      const link = item.productDetailUrl || item.detailUrl || "";

      if (productId && title) {
        products.push({
          id: String(productId),
          title: typeof title === "string" ? title.replace(/<[^>]*>/g, "") : String(title),
          price: typeof priceInfo === "string" ? priceInfo : `$${priceInfo}`,
          originalPrice: originalPrice ? (typeof originalPrice === "string" ? originalPrice : `$${originalPrice}`) : undefined,
          discount: discount ? String(discount) : undefined,
          imageUrl: imageUrl ? (imageUrl.startsWith("//") ? `https:${imageUrl}` : imageUrl) : "",
          productUrl: link ? (link.startsWith("//") ? `https:${link}` : link.startsWith("http") ? link : `https://www.aliexpress.com/item/${productId}.html`) : `https://www.aliexpress.com/item/${productId}.html`,
          orders: orders ? String(orders) : undefined,
          rating: rating ? String(rating) : undefined,
          store: store ? String(store) : undefined,
        });
      }
    }
  } catch (e: any) {
    log(`JSON parse products error: ${e.message}`, "scraper");
  }
  return products;
}

function parseProductsFromHtml(html: string): Product[] {
  const products: Product[] = [];

  const initDataRegex = /window\.__INIT_DATA__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/;
  const initMatch = initDataRegex.exec(html);
  if (initMatch) {
    try {
      const data = JSON.parse(initMatch[1]);
      const jsonProducts = parseProductsFromJson(data);
      if (jsonProducts.length > 0) return jsonProducts;
    } catch (e) {}
  }

  const ssrDataPatterns = [
    /"itemList"\s*:\s*\{[^}]*"content"\s*:\s*(\[[\s\S]*?\])\s*\}/,
    /"resultList"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
  ];

  for (const pattern of ssrDataPatterns) {
    const match = pattern.exec(html);
    if (match) {
      try {
        const items = JSON.parse(match[1]);
        const jsonProducts = parseProductsFromJson({ items });
        if (jsonProducts.length > 0) return jsonProducts;
      } catch (e) {}
    }
  }

  const jsonDataRegex = /"productId"\s*:\s*"?(\d+)"?[^}]*?"title"\s*:\s*(?:\{[^}]*"displayTitle"\s*:\s*"([^"]*)"[^}]*\}|"([^"]*)")(?:[^}]*?"salePrice"\s*:\s*\{[^}]*?"formattedPrice"\s*:\s*"([^"]*)")?(?:[^}]*?"imgUrl"\s*:\s*"([^"]*)")?/g;
  let match;
  while ((match = jsonDataRegex.exec(html)) !== null) {
    const id = match[1];
    const title = match[2] || match[3] || "";
    const price = match[4] || "";
    const img = match[5] || "";
    if (id && title && !products.find(p => p.id === id)) {
      products.push({
        id,
        title: title.replace(/<[^>]*>/g, ""),
        price: price || "Price unavailable",
        imageUrl: img ? (img.startsWith("//") ? `https:${img}` : img) : "",
        productUrl: `https://www.aliexpress.com/item/${id}.html`,
      });
    }
  }

  if (products.length === 0) {
    const simpleProductRegex = /"productId"\s*:\s*"(\d+)"[\s\S]*?"title"\s*:\s*"([^"]{5,200})"/g;
    while ((match = simpleProductRegex.exec(html)) !== null) {
      const id = match[1];
      const title = match[2];
      if (!products.find(p => p.id === id)) {
        products.push({
          id,
          title: title.replace(/<[^>]*>/g, ""),
          price: "Price unavailable",
          imageUrl: "",
          productUrl: `https://www.aliexpress.com/item/${id}.html`,
        });
      }
    }
  }

  const priceMap = new Map<string, string>();
  const priceRegex = /"productId"\s*:\s*"(\d+)"[\s\S]*?(?:"formattedPrice"\s*:\s*"([^"]*)")/g;
  while ((match = priceRegex.exec(html)) !== null) {
    if (match[2]) priceMap.set(match[1], match[2]);
  }

  const imgMap = new Map<string, string>();
  const imgRegex = /"productId"\s*:\s*"(\d+)"[\s\S]*?(?:"imgUrl"\s*:\s*"([^"]*)")/g;
  while ((match = imgRegex.exec(html)) !== null) {
    if (match[2]) {
      const url = match[2].startsWith("//") ? `https:${match[2]}` : match[2];
      imgMap.set(match[1], url);
    }
  }

  for (const p of products) {
    if ((!p.price || p.price === "Price unavailable") && priceMap.has(p.id)) {
      p.price = priceMap.get(p.id)!;
    }
    if (!p.imageUrl && imgMap.has(p.id)) {
      p.imageUrl = imgMap.get(p.id)!;
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
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
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

  try {
    const apiUrl = buildAliexpressApiUrl(categoryId, sortBy, page);
    log(`Fast scrape attempt (API endpoint): ${apiUrl}`, "scraper");

    const apiHtml = await fetchWithScraperApi(apiUrl, false, 30000);

    let products: Product[] = [];
    try {
      const jsonData = JSON.parse(apiHtml);
      products = parseProductsFromJson(jsonData);
    } catch {
      products = parseProductsFromHtml(apiHtml);
    }

    if (products.length > 0) {
      log(`Fast scrape found ${products.length} products`, "scraper");
      return {
        products,
        category: categoryName,
        totalFound: products.length,
        scrapedAt: new Date().toISOString(),
      };
    }
  } catch (error: any) {
    log(`Fast scrape failed: ${error.message}`, "scraper");
  }

  try {
    const targetUrl = buildAliexpressUrl(categoryId, sortBy, page);
    log(`Standard scrape (no render): ${targetUrl}`, "scraper");

    const html = await fetchWithScraperApi(targetUrl, false, 45000);
    log(`Received ${html.length} bytes`, "scraper");

    const products = parseProductsFromHtml(html);

    if (products.length > 0) {
      log(`Standard scrape found ${products.length} products`, "scraper");
      return {
        products,
        category: categoryName,
        totalFound: products.length,
        scrapedAt: new Date().toISOString(),
      };
    }
  } catch (error: any) {
    log(`Standard scrape failed: ${error.message}`, "scraper");
  }

  const targetUrl = buildAliexpressUrl(categoryId, sortBy, page);
  log(`Fallback scrape (with render): ${targetUrl}`, "scraper");

  const html = await fetchWithScraperApi(targetUrl, true, 90000);
  log(`Received ${html.length} bytes (rendered)`, "scraper");

  const products = parseProductsFromHtml(html);
  log(`Rendered scrape found ${products.length} products from ${categoryName}`, "scraper");

  return {
    products,
    category: categoryName,
    totalFound: products.length,
    scrapedAt: new Date().toISOString(),
  };
}
