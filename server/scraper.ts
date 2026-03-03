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

function parseProducts(html: string): Product[] {
  const products: Product[] = [];

  const cardPatterns = [
    /data-product-id="(\d+)"[^>]*>[\s\S]*?<\/div>/g,
    /<a[^>]*class="[^"]*multi--container[^"]*"[^>]*href="([^"]*)"[\s\S]*?<\/a>/g,
    /<div[^>]*class="[^"]*search-card-item[^"]*"[\s\S]*?<\/div>/g,
  ];

  const titleRegex = /<(?:h1|h3|span|div)[^>]*class="[^"]*(?:title|name|subject)[^"]*"[^>]*>([^<]+)<\/(?:h1|h3|span|div)>/gi;
  const priceRegex = /(?:US\s*\$|USD\s*|€|\$)\s*(\d+[\.,]\d{0,2})/gi;
  const imageRegex = /<img[^>]*(?:src|data-src)="(https?:\/\/[^"]*(?:alicdn|aliexpress)[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"[^>]*>/gi;
  const linkRegex = /<a[^>]*href="((?:https?:)?\/\/(?:www\.)?aliexpress\.com\/item\/[^"]*)"[^>]*>/gi;
  const ordersRegex = /(\d[\d,]*)\+?\s*(?:sold|orders|vendu)/gi;
  const ratingRegex = /(\d\.?\d*)\s*(?:star|rating|\/5)/gi;
  const storeRegex = /<a[^>]*class="[^"]*store[^"]*"[^>]*>([^<]+)<\/a>/gi;
  const discountRegex = /(-?\d+%?\s*(?:off|OFF|de réduction))/gi;

  const titles: string[] = [];
  const prices: string[] = [];
  const images: string[] = [];
  const links: string[] = [];
  const orderCounts: string[] = [];
  const ratings: string[] = [];

  let match;

  while ((match = titleRegex.exec(html)) !== null) {
    const title = match[1].trim();
    if (title.length > 5 && title.length < 300) {
      titles.push(title);
    }
  }

  while ((match = priceRegex.exec(html)) !== null) {
    prices.push(match[1]);
  }

  while ((match = imageRegex.exec(html)) !== null) {
    const url = match[1];
    if (!url.includes("icon") && !url.includes("logo") && !url.includes("sprite")) {
      images.push(url.startsWith("//") ? `https:${url}` : url);
    }
  }

  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    links.push(url.startsWith("//") ? `https:${url}` : url);
  }

  while ((match = ordersRegex.exec(html)) !== null) {
    orderCounts.push(match[1]);
  }

  while ((match = ratingRegex.exec(html)) !== null) {
    ratings.push(match[1]);
  }

  const jsonDataRegex = /"productId"\s*:\s*"?(\d+)"?[\s\S]*?"title"\s*:\s*"([^"]*)"[\s\S]*?"price"\s*:\s*"?([^",\}]*)"?/g;
  while ((match = jsonDataRegex.exec(html)) !== null) {
    const existing = products.find(p => p.id === match[1]);
    if (!existing) {
      products.push({
        id: match[1],
        title: match[2],
        price: `$${match[3]}`,
        imageUrl: "",
        productUrl: `https://www.aliexpress.com/item/${match[1]}.html`,
      });
    }
  }

  const scriptDataRegex = /window\._dida_config_\s*=\s*(\{[\s\S]*?\});/;
  const scriptMatch = scriptDataRegex.exec(html);

  const itemListRegex = /"items"\s*:\s*\[([\s\S]*?)\]/;
  const itemListMatch = itemListRegex.exec(html);

  if (itemListMatch) {
    try {
      const itemPattern = /\{[^{}]*"productId"\s*:\s*"?(\d+)"?[^{}]*"title"\s*:\s*"([^"]*)"[^{}]*\}/g;
      let itemMatch;
      while ((itemMatch = itemPattern.exec(itemListMatch[1])) !== null) {
        const existing = products.find(p => p.id === itemMatch[1]);
        if (!existing) {
          products.push({
            id: itemMatch[1],
            title: itemMatch[2],
            price: "",
            imageUrl: "",
            productUrl: `https://www.aliexpress.com/item/${itemMatch[1]}.html`,
          });
        }
      }
    } catch (e) {}
  }

  const ssrDataRegex = /window\.__INIT_DATA__\s*=\s*(\{[\s\S]*?\});\s*(?:<\/script>|$)/;
  const ssrMatch = ssrDataRegex.exec(html);
  if (ssrMatch) {
    try {
      const jsonStr = ssrMatch[1];
      const productIdPattern = /"productId"\s*:\s*"(\d+)"/g;
      const ids: string[] = [];
      let idMatch;
      while ((idMatch = productIdPattern.exec(jsonStr)) !== null) {
        ids.push(idMatch[1]);
      }
    } catch (e) {}
  }

  if (products.length === 0 && titles.length > 0) {
    const count = Math.min(titles.length, Math.max(images.length, 1));
    for (let i = 0; i < count; i++) {
      products.push({
        id: `parsed_${i}_${Date.now()}`,
        title: titles[i] || "Unknown Product",
        price: prices[i * 2] ? `$${prices[i * 2]}` : "Price unavailable",
        originalPrice: prices[i * 2 + 1] ? `$${prices[i * 2 + 1]}` : undefined,
        imageUrl: images[i] || "",
        productUrl: links[i] || "#",
        orders: orderCounts[i] || undefined,
        rating: ratings[i] || undefined,
      });
    }
  }

  for (let i = 0; i < products.length; i++) {
    if (!products[i].imageUrl && images[i]) {
      products[i].imageUrl = images[i];
    }
    if ((!products[i].price || products[i].price === "") && prices[i]) {
      products[i].price = `$${prices[i]}`;
    }
    if (!products[i].orders && orderCounts[i]) {
      products[i].orders = orderCounts[i];
    }
    if (!products[i].rating && ratings[i]) {
      products[i].rating = ratings[i];
    }
  }

  return products.filter(p => p.title && p.title.length > 3);
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

  const targetUrl = buildAliexpressUrl(categoryId, sortBy, page);
  log(`Scraping AliExpress: ${targetUrl}`, "scraper");

  const scraperUrl = `https://api.scraperapi.com?api_key=${SCRAPERAPI_KEY}&url=${encodeURIComponent(targetUrl)}&render=true&country_code=us`;

  try {
    const response = await fetch(scraperUrl, {
      method: "GET",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      throw new Error(`ScraperAPI returned ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    log(`Received ${html.length} bytes from ScraperAPI`, "scraper");

    const products = parseProducts(html);
    log(`Parsed ${products.length} products from category ${categoryName}`, "scraper");

    return {
      products,
      category: categoryName,
      totalFound: products.length,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    log(`Scraping error: ${error.message}`, "scraper");
    throw error;
  }
}
