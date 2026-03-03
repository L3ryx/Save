import { z } from "zod";

export const aliexpressCategories = [
  { id: "44", name: "Phones & Telecommunications", icon: "Smartphone" },
  { id: "509", name: "Computer & Office", icon: "Monitor" },
  { id: "7", name: "Consumer Electronics", icon: "Headphones" },
  { id: "320", name: "Toys & Hobbies", icon: "Gamepad2" },
  { id: "2", name: "Home & Garden", icon: "Home" },
  { id: "36", name: "Sports & Entertainment", icon: "Dumbbell" },
  { id: "1501", name: "Mother & Kids", icon: "Baby" },
  { id: "6", name: "Home Appliances", icon: "Refrigerator" },
  { id: "1524", name: "Fashion Accessories", icon: "Watch" },
  { id: "200003655", name: "Beauty & Health", icon: "Sparkles" },
  { id: "34", name: "Automobiles & Motorcycles", icon: "Car" },
  { id: "30", name: "Jewelry & Accessories", icon: "Gem" },
  { id: "100003109", name: "Tools & Hardware", icon: "Wrench" },
  { id: "1503", name: "Bags & Shoes", icon: "ShoppingBag" },
  { id: "200003482", name: "Women's Clothing", icon: "Shirt" },
  { id: "200000532", name: "Men's Clothing", icon: "Shirt" },
] as const;

export type AliexpressCategory = typeof aliexpressCategories[number];

export const productSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.string(),
  originalPrice: z.string().optional(),
  discount: z.string().optional(),
  rating: z.string().optional(),
  orders: z.string().optional(),
  imageUrl: z.string(),
  productUrl: z.string(),
  store: z.string().optional(),
  shippingInfo: z.string().optional(),
});

export type Product = z.infer<typeof productSchema>;

export const scrapeRequestSchema = z.object({
  categoryId: z.string(),
  page: z.number().min(1).max(10).default(1),
  sortBy: z.enum(["orders", "price_asc", "price_desc", "rating"]).default("orders"),
});

export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>;

export const scrapeResponseSchema = z.object({
  products: z.array(productSchema),
  category: z.string(),
  totalFound: z.number(),
  scrapedAt: z.string(),
});

export type ScrapeResponse = z.infer<typeof scrapeResponseSchema>;
