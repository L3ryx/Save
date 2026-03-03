import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scrapeAliexpress, scrapeMultiplePages, searchAliexpressByKeyword } from "./scraper";
import { scrapeEtsy, extractSearchKeywords, scoreMatch, scrapeEtsyTrendingKeywords } from "./etsy-scraper";
import { searchImagesByQuery, findAliexpressFromImageResults } from "./zenserp";
import { scrapeRequestSchema, etsySearchRequestSchema, aliexpressCategories } from "@shared/schema";
import type { MatchedProduct, Product } from "@shared/schema";
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

      const hasZenserp = !!process.env.ZENSERP_API_KEY;
      const limitedForVisual = etsyProducts.slice(0, 6);

      let visualMatchesMap = new Map<string, Product[]>();
      if (hasZenserp) {
        log(`Running Zenserp visual search for ${limitedForVisual.length} products`, "routes");
        await Promise.all(
          limitedForVisual.map(async (ep) => {
            try {
              const imageResults = await searchImagesByQuery(ep.title + " aliexpress", 20);
              const aliHits = findAliexpressFromImageResults(imageResults);
              if (aliHits.length > 0) {
                const visualProducts: Product[] = aliHits.map((hit, idx) => ({
                  id: `visual-${ep.id}-${idx}`,
                  title: hit.title,
                  price: "",
                  imageUrl: hit.thumbnail || "",
                  productUrl: hit.link,
                  store: hit.source,
                }));
                visualMatchesMap.set(ep.id, visualProducts);
                log(`Zenserp found ${aliHits.length} AliExpress hits for "${ep.title.substring(0, 30)}"`, "routes");
              }
            } catch (err: any) {
              log(`Zenserp error for "${ep.title.substring(0, 30)}": ${err.message}`, "routes");
            }
          })
        );
      }

      const matches: MatchedProduct[] = etsyProducts.map((etsyProduct) => {
        const scored = aliProducts.map(ali => ({
          product: ali,
          score: scoreMatch(etsyProduct.title, etsyProduct.price, ali.title, ali.price),
        }));

        scored.sort((a, b) => b.score - a.score);
        let topMatches = scored.slice(0, 5).map(s => s.product);

        const visualHits = visualMatchesMap.get(etsyProduct.id) || [];
        if (visualHits.length > 0) {
          const existingIds = new Set(topMatches.map(m => m.productUrl));
          const newVisual = visualHits.filter(v => !existingIds.has(v.productUrl));
          topMatches = [...newVisual.slice(0, 3), ...topMatches].slice(0, 8);
        }

        const hasVisual = visualHits.length > 0;
        const baseScore = scored[0]?.score || 0;
        const finalScore = hasVisual ? Math.min(baseScore + 0.3, 1.0) : baseScore;

        return {
          etsyProduct,
          aliexpressMatches: topMatches,
          searchKeywords: searchTerms,
          matchScore: finalScore,
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

          const hasZenserp = !!process.env.ZENSERP_API_KEY;
          const visualMap = new Map<string, Product[]>();
          if (hasZenserp) {
            const topEtsy = etsyProducts.slice(0, 4);
            await Promise.all(
              topEtsy.map(async (ep) => {
                try {
                  const imgResults = await searchImagesByQuery(ep.title + " aliexpress", 15);
                  const aliHits = findAliexpressFromImageResults(imgResults);
                  if (aliHits.length > 0) {
                    visualMap.set(ep.id, aliHits.map((hit, idx) => ({
                      id: `visual-${ep.id}-${idx}`,
                      title: hit.title,
                      price: "",
                      imageUrl: hit.thumbnail || "",
                      productUrl: hit.link,
                      store: hit.source,
                    })));
                  }
                } catch {}
              })
            );
          }

          for (const etsyProduct of etsyProducts) {
            if (goodMatches.length >= targetMatches || clientDisconnected) break;
            if (seenEtsyIds.has(etsyProduct.id)) continue;

            const scored = aliProducts.map(ali => ({
              product: ali,
              score: scoreMatch(etsyProduct.title, etsyProduct.price, ali.title, ali.price),
            }));

            scored.sort((a, b) => b.score - a.score);
            const baseScore = scored[0]?.score || 0;
            const visualHits = visualMap.get(etsyProduct.id) || [];
            const hasVisual = visualHits.length > 0;
            const finalScore = hasVisual ? Math.min(baseScore + 0.3, 1.0) : baseScore;

            if (finalScore >= minScore) {
              let topMatches = scored.slice(0, 5).map(s => s.product);
              if (visualHits.length > 0) {
                const existingUrls = new Set(topMatches.map(m => m.productUrl));
                const newVisual = visualHits.filter(v => !existingUrls.has(v.productUrl));
                topMatches = [...newVisual.slice(0, 3), ...topMatches].slice(0, 8);
              }

              const match: MatchedProduct = {
                etsyProduct,
                aliexpressMatches: topMatches,
                searchKeywords: keyword,
                matchScore: finalScore,
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
