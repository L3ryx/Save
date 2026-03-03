# AliExpress Scraper

## Overview
A web application that scrapes and analyzes best-selling products on AliExpress by category using ScraperAPI.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui components
- **Backend**: Express.js with ScraperAPI integration
- **Storage**: In-memory cache (10-minute TTL) for scrape results

## Key Features
- Browse 16 AliExpress product categories
- Scrape best-selling products with ScraperAPI
- Sort by: Most Sold, Price (Low/High), Best Rating
- Pagination support (up to 10 pages)
- Result caching to avoid redundant API calls

## Project Structure
- `shared/schema.ts` - Shared types, categories, and Zod schemas
- `server/scraper.ts` - ScraperAPI integration and HTML parser
- `server/routes.ts` - API endpoints (/api/categories, /api/scrape)
- `server/storage.ts` - In-memory cache for scraped results
- `client/src/pages/home.tsx` - Main UI with category selector and product grid

## Environment Variables
- `SCRAPERAPI_KEY` - ScraperAPI key for scraping (required)

## API Endpoints
- `GET /api/categories` - Returns list of AliExpress categories
- `POST /api/scrape` - Scrapes products (body: { categoryId, sortBy, page })
