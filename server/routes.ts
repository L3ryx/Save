import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scrapeAliexpress, scrapeMultiplePages } from "./scraper";
import { scrapeRequestSchema, aliexpressCategories } from "@shared/schema";
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

  return httpServer;
}
