import { type Product, type ScrapeResponse } from "@shared/schema";

export interface IStorage {
  cacheProducts(categoryId: string, sortBy: string, page: number, response: ScrapeResponse): Promise<void>;
  getCachedProducts(categoryId: string, sortBy: string, page: number): Promise<ScrapeResponse | undefined>;
}

export class MemStorage implements IStorage {
  private cache: Map<string, { data: ScrapeResponse; timestamp: number }>;
  private cacheTTL = 30 * 60 * 1000;

  constructor() {
    this.cache = new Map();
  }

  private getCacheKey(categoryId: string, sortBy: string, page: number): string {
    return `${categoryId}_${sortBy}_${page}`;
  }

  async cacheProducts(categoryId: string, sortBy: string, page: number, response: ScrapeResponse): Promise<void> {
    const key = this.getCacheKey(categoryId, sortBy, page);
    this.cache.set(key, { data: response, timestamp: Date.now() });
  }

  async getCachedProducts(categoryId: string, sortBy: string, page: number): Promise<ScrapeResponse | undefined> {
    const key = this.getCacheKey(categoryId, sortBy, page);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    if (cached) {
      this.cache.delete(key);
    }
    return undefined;
  }
}

export const storage = new MemStorage();
