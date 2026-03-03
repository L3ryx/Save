import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scrapeAliexpress, scrapeMultiplePages, searchAliexpressByKeyword } from "./scraper";
import { scrapeEtsy, extractSearchKeywords, scoreMatch, scrapeEtsyTrendingKeywords } from "./etsy-scraper";
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

      const searchTerms = extractSearchKeywords(keyword);
      log(`Extracted search terms: "${searchTerms}"`, "routes");

      const [etsyProducts, aliProducts] = await Promise.all([
        scrapeEtsy(keyword, maxResults),
        searchAliexpressByKeyword(searchTerms, 60),
      ]);

      log(`Found ${etsyProducts.length} Etsy products and ${aliProducts.length} AliExpress products`, "routes");

      if (etsyProducts.length === 0) {
        return res.json({
          matches: [],
          keyword,
          totalEtsyProducts: 0,
          scrapedAt: new Date().toISOString(),
        });
      }

      const matches: MatchedProduct[] = etsyProducts.map((etsyProduct) => {
        const scored = aliProducts.map(ali => ({
          product: ali,
          score: scoreMatch(etsyProduct.title, etsyProduct.price, ali.title, ali.price),
        }));

        scored.sort((a, b) => b.score - a.score);
        const topMatches = scored.slice(0, 5).map(s => s.product);

        return {
          etsyProduct,
          aliexpressMatches: topMatches,
          searchKeywords: searchTerms,
          matchScore: scored[0]?.score || 0,
        };
      });

      matches.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

      return res.json({
        matches,
        keyword,
        totalEtsyProducts: etsyProducts.length,
        totalAliProducts: aliProducts.length,
        scrapedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      log(`Etsy search error: ${error.message}`, "routes");
      return res.status(500).json({ message: error.message || "Failed to search Etsy" });
    }
  });

  app.get("/api/etsy/trending-keywords", async (_req, res) => {
    try {
      const keywords = await scrapeEtsyTrendingKeywords();
      return res.json({ keywords });
    } catch (error: any) {
      log(`Trending keywords error: ${error.message}`, "routes");
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/etsy/auto-discover", async (req, res) => {
    const minScore = 0.25;
    const targetMatches = 10;
    let clientDisconnected = false;

    req.on("close", () => {
      clientDisconnected = true;
      log("Auto-discover: client disconnected, stopping", "routes");
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    function sendEvent(type: string, data: any) {
      if (!clientDisconnected) {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      }
    }

    try {
      sendEvent("status", { message: "Fetching trending keywords from Etsy..." });
      const keywords = await scrapeEtsyTrendingKeywords();
      sendEvent("keywords", { keywords, total: keywords.length });

      const goodMatches: MatchedProduct[] = [];
      const seenEtsyIds = new Set<string>();

      for (let i = 0; i < keywords.length; i++) {
        if (goodMatches.length >= targetMatches || clientDisconnected) break;

        const keyword = keywords[i];
        sendEvent("status", {
          message: `Searching "${keyword}" (${i + 1}/${keywords.length})...`,
          currentKeyword: keyword,
          keywordIndex: i,
          foundSoFar: goodMatches.length,
        });

        try {
          const searchTerms = extractSearchKeywords(keyword);

          const [etsyProducts, aliProducts] = await Promise.all([
            scrapeEtsy(keyword, 12),
            searchAliexpressByKeyword(searchTerms, 40),
          ]);

          log(`"${keyword}": ${etsyProducts.length} Etsy, ${aliProducts.length} AliExpress`, "routes");

          if (etsyProducts.length === 0 || aliProducts.length === 0) {
            sendEvent("keyword_done", {
              keyword,
              found: 0,
              message: `No products found for "${keyword}"`,
            });
            continue;
          }

          let keywordNewMatches = 0;

          for (const etsyProduct of etsyProducts) {
            if (goodMatches.length >= targetMatches) break;
            if (seenEtsyIds.has(etsyProduct.id)) continue;

            const scored = aliProducts.map(ali => ({
              product: ali,
              score: scoreMatch(etsyProduct.title, etsyProduct.price, ali.title, ali.price),
            }));

            scored.sort((a, b) => b.score - a.score);
            const bestScore = scored[0]?.score || 0;

            if (bestScore >= minScore) {
              const topMatches = scored.slice(0, 5).map(s => s.product);
              const match: MatchedProduct = {
                etsyProduct,
                aliexpressMatches: topMatches,
                searchKeywords: keyword,
                matchScore: bestScore,
              };

              goodMatches.push(match);
              seenEtsyIds.add(etsyProduct.id);
              keywordNewMatches++;

              sendEvent("match", {
                match,
                totalFound: goodMatches.length,
                target: targetMatches,
              });
            }
          }

          sendEvent("keyword_done", {
            keyword,
            found: keywordNewMatches,
            totalFound: goodMatches.length,
          });

        } catch (error: any) {
          log(`Auto-discover error for "${keyword}": ${error.message}`, "routes");
          sendEvent("keyword_error", {
            keyword,
            error: error.message,
          });
        }
      }

      sendEvent("complete", {
        matches: goodMatches,
        totalFound: goodMatches.length,
        keywordsSearched: Math.min(keywords.length, goodMatches.length >= targetMatches
          ? keywords.indexOf(goodMatches[goodMatches.length - 1]?.searchKeywords || "") + 1
          : keywords.length),
      });

      res.end();
    } catch (error: any) {
      log(`Auto-discover fatal error: ${error.message}`, "routes");
      sendEvent("error", { message: error.message });
      res.end();
    }
  });

  return httpServer;
}
