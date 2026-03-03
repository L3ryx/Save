import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scrapeAliexpress, scrapeMultiplePages, searchAliexpressByKeyword } from "./scraper";
import { scrapeEtsy, analyzeEtsyProductForAliexpress, extractSearchKeywords } from "./etsy-scraper";
import { scrapeRequestSchema, etsySearchRequestSchema, aliexpressCategories } from "@shared/schema";
import type { MatchedProduct } from "@shared/schema";
import { log } from "./index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/categories", (_req, res) => {
    res.json(aliexpressCategories);
  });

  app.post("/api/scrape", async (req, res) => {
    try {
      const parsed = scrapeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      }

      const { categoryId, sortBy, page, minSales, maxPages } = parsed.data;

      const validCategory = aliexpressCategories.find(c => c.id === categoryId);
      if (!validCategory) {
        return res.status(400).json({ message: `Invalid category ID: ${categoryId}` });
      }

      const useMultiPage = (maxPages && maxPages > 1) || (minSales && minSales > 0);

      if (useMultiPage) {
        const cacheKey = `multi_${minSales || 0}`;
        const cached = await storage.getCachedProducts(categoryId, cacheKey, page);
        if (cached) {
          log(`Serving cached multi-page results for category ${categoryId}`, "cache");
          return res.json(cached);
        }

        const result = await scrapeMultiplePages(
          categoryId,
          sortBy,
          page,
          maxPages || 5,
          minSales || 0
        );

        if (result.products.length > 0) {
          await storage.cacheProducts(categoryId, cacheKey, page, result);
        }

        return res.json(result);
      }

      const cached = await storage.getCachedProducts(categoryId, sortBy, page);
      if (cached) {
        log(`Serving cached results for category ${categoryId}`, "cache");
        return res.json(cached);
      }

      const result = await scrapeAliexpress(categoryId, sortBy, page);

      if (result.products.length > 0) {
        await storage.cacheProducts(categoryId, sortBy, page, result);
      }

      return res.json(result);
    } catch (error: any) {
      log(`Scrape error: ${error.message}`, "routes");
      return res.status(500).json({ message: error.message || "Failed to scrape products" });
    }
  });

  app.post("/api/etsy/search", async (req, res) => {
    try {
      const parsed = etsySearchRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      }

      const { keyword, maxResults } = parsed.data;
      log(`Etsy search: "${keyword}" (max ${maxResults})`, "routes");

      const etsyProducts = await scrapeEtsy(keyword, maxResults);
      log(`Found ${etsyProducts.length} Etsy products`, "routes");

      if (etsyProducts.length === 0) {
        return res.json({
          matches: [],
          keyword,
          totalEtsyProducts: 0,
          scrapedAt: new Date().toISOString(),
        });
      }

      const limitedProducts = etsyProducts.slice(0, 8);

      log(`Analyzing ${limitedProducts.length} products in parallel`, "routes");
      const analysisResults = await Promise.all(
        limitedProducts.map(async (etsyProduct) => {
          let searchTerms: string;
          try {
            searchTerms = await analyzeEtsyProductForAliexpress(etsyProduct);
          } catch {
            searchTerms = extractSearchKeywords(etsyProduct.title);
          }
          log(`AI terms for "${etsyProduct.title.substring(0, 30)}": "${searchTerms}"`, "routes");
          return { etsyProduct, searchTerms };
        })
      );

      const uniqueSearchTerms = Array.from(new Set(analysisResults.map(r => r.searchTerms)));
      log(`${uniqueSearchTerms.length} unique search terms, fetching AliExpress in parallel`, "routes");

      const aliResultsMap = new Map<string, import("@shared/schema").Product[]>();
      await Promise.all(
        uniqueSearchTerms.map(async (terms) => {
          const aliProducts = await searchAliexpressByKeyword(terms, 20);
          aliResultsMap.set(terms, aliProducts);
          log(`AliExpress: ${aliProducts.length} products for "${terms}"`, "routes");
        })
      );

      const matches: MatchedProduct[] = analysisResults.map(({ etsyProduct, searchTerms }) => {
        const aliProducts = aliResultsMap.get(searchTerms) || [];

        const etsyWords = etsyProduct.title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter(w => w.length > 2);

        const scored = aliProducts.map(ali => {
          const aliWords = ali.title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter(w => w.length > 2);
          let matchCount = 0;
          for (const word of etsyWords) {
            if (aliWords.some(aw => aw.includes(word) || word.includes(aw))) matchCount++;
          }
          return { product: ali, score: etsyWords.length > 0 ? matchCount / etsyWords.length : 0 };
        });

        scored.sort((a, b) => b.score - a.score);
        const topMatches = scored.slice(0, 5).map(s => s.product);

        return { etsyProduct, aliexpressMatches: topMatches, searchKeywords: searchTerms };
      });

      return res.json({
        matches,
        keyword,
        totalEtsyProducts: etsyProducts.length,
        scrapedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      log(`Etsy search error: ${error.message}`, "routes");
      return res.status(500).json({ message: error.message || "Failed to search Etsy" });
    }
  });

  return httpServer;
}
