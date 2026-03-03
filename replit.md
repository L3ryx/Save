# AliExpress & Etsy Scraper

## Overview
A web application that scrapes products on AliExpress by category and Etsy by keyword, using ScrapingBee AI to analyze Etsy product images and find matching products on AliExpress.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui components
- **Backend**: Express.js with ScraperAPI (AliExpress) and ScrapingBee (Etsy + AI analysis)
- **Storage**: In-memory cache (30-minute TTL) for scrape results

## Key Features
- Browse 16 AliExpress product categories
- Scrape best-selling AliExpress products with ScraperAPI
- **Etsy → AliExpress Finder**: Searches Etsy and AliExpress in parallel (1 call each), then matches products using title keyword overlap + price ratio scoring
- **Auto-Discover mode**: Scrapes trending Etsy keywords, iterates through each one searching Etsy+AliExpress until 10 good matches (score ≥25%) are found. Uses SSE for real-time progress streaming.
- Match score displayed per product (green ≥50%, yellow ≥25%, gray below)
- Results sorted by best match score
- Sort by: Most Sold, Price (Low/High), Best Rating
- Pagination support (up to 10 pages)
- Result caching to avoid redundant API calls

## Project Structure
- `shared/schema.ts` - Shared types, categories, Zod schemas (Product, EtsyProduct, MatchedProduct)
- `server/scraper.ts` - ScraperAPI integration for AliExpress (category + keyword search)
- `server/etsy-scraper.ts` - ScrapingBee integration for Etsy scraping + AI product analysis
- `server/routes.ts` - API endpoints
- `server/storage.ts` - In-memory cache for scraped results
- `client/src/pages/home.tsx` - AliExpress category scraper UI
- `client/src/pages/etsy.tsx` - Etsy → AliExpress finder UI
- `client/src/App.tsx` - Routing (/, /etsy)

## Environment Variables
- `SCRAPERAPI_KEY` - ScraperAPI key for AliExpress scraping (required)
- `SCRAPINGBEE_API_KEY` - ScrapingBee key for Etsy scraping + AI analysis (required)

## API Endpoints
- `GET /api/categories` - Returns list of AliExpress categories
- `POST /api/scrape` - Scrapes AliExpress products (body: { categoryId, sortBy, page, minSales, maxPages })
- `POST /api/etsy/search` - Searches Etsy, analyzes images with AI, finds AliExpress matches (body: { keyword, maxResults })

## Deployment
- `render.yaml` and `Dockerfile` configured for Render deployment
- Build: `npm run build` / Start: `npm run start`
