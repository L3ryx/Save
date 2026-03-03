import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { type Product, type ScrapeResponse, type AliexpressCategory, aliexpressCategories } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Smartphone, Monitor, Headphones, Gamepad2, Home, Dumbbell,
  Baby, Refrigerator, Watch, Sparkles, Car, Gem, Wrench,
  ShoppingBag, Shirt, Search, TrendingUp, Star, Package,
  ExternalLink, Loader2, AlertCircle, ShoppingCart, ArrowUpDown,
  ChevronLeft, ChevronRight, Zap, Globe, Filter, Layers
} from "lucide-react";

const iconMap: Record<string, any> = {
  Smartphone, Monitor, Headphones, Gamepad2, Home, Dumbbell,
  Baby, Refrigerator, Watch, Sparkles, Car, Gem, Wrench,
  ShoppingBag, Shirt,
};

function CategoryCard({
  category,
  isSelected,
  onClick,
}: {
  category: AliexpressCategory;
  isSelected: boolean;
  onClick: () => void;
}) {
  const Icon = iconMap[category.icon] || Package;
  return (
    <button
      onClick={onClick}
      data-testid={`category-${category.id}`}
      className={`
        relative flex flex-col items-center gap-2 p-4 rounded-md border transition-all duration-200 cursor-pointer
        ${isSelected
          ? "bg-primary text-primary-foreground border-primary-border"
          : "bg-card text-card-foreground border-card-border hover-elevate"
        }
      `}
    >
      <Icon className="w-5 h-5" />
      <span className="text-xs font-medium text-center leading-tight">{category.name}</span>
    </button>
  );
}

function ProductCard({ product }: { product: Product }) {
  return (
    <Card className="group flex flex-col border-card-border hover-elevate">
      <div className="relative aspect-square bg-muted rounded-t-md">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.title}
            className="w-full h-full object-cover rounded-t-md"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-12 h-12 text-muted-foreground" />
          </div>
        )}
        {product.discount && (
          <Badge variant="destructive" className="absolute top-2 left-2 text-xs">
            {product.discount}
          </Badge>
        )}
      </div>
      <div className="flex flex-col flex-1 p-3 gap-2">
        <h3
          className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.5rem]"
          title={product.title}
          data-testid={`product-title-${product.id}`}
        >
          {product.title}
        </h3>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-lg font-bold text-foreground" data-testid={`product-price-${product.id}`}>
            {product.price}
          </span>
          {product.originalPrice && (
            <span className="text-xs text-muted-foreground line-through">
              {product.originalPrice}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {product.rating && (
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className="text-xs text-muted-foreground">{product.rating}</span>
            </div>
          )}
          {product.orders && (
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{product.orders.toLowerCase().includes("sold") ? product.orders : `${product.orders} sold`}</span>
            </div>
          )}
        </div>
        {product.store && (
          <span className="text-xs text-muted-foreground truncate">{product.store}</span>
        )}
        <div className="mt-auto pt-2">
          <a
            href={product.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`product-link-${product.id}`}
          >
            <Button variant="outline" size="sm" className="w-full gap-2">
              <ExternalLink className="w-3 h-3" />
              View on AliExpress
            </Button>
          </a>
        </div>
      </div>
    </Card>
  );
}

function ProductSkeleton() {
  return (
    <Card className="flex flex-col border-card-border">
      <Skeleton className="aspect-square rounded-t-md rounded-b-none" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-8 w-full mt-2" />
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
        <Search className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">Select a category to start</h3>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        Choose a product category above to discover the best-selling items on AliExpress
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold">Scraping failed</h3>
      <p className="text-sm text-muted-foreground text-center max-w-md">{message}</p>
      <Button onClick={onRetry} variant="outline" data-testid="button-retry">
        Try again
      </Button>
    </div>
  );
}

export default function HomePage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("orders");
  const [currentPage, setCurrentPage] = useState(1);
  const [minSales, setMinSales] = useState<number>(1000);
  const [maxPages, setMaxPages] = useState<number>(5);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResponse | null>(null);
  const { toast } = useToast();

  const selectedCategoryData = aliexpressCategories.find(c => c.id === selectedCategory);

  const scrapeMutation = useMutation({
    mutationFn: async (params: { categoryId: string; sortBy: string; page: number; minSales?: number; maxPages?: number }) => {
      const response = await apiRequest("POST", "/api/scrape", params);
      return await response.json() as ScrapeResponse;
    },
    onSuccess: (data) => {
      setScrapeResult(data);
      if (data.products.length === 0) {
        toast({
          title: "No products found",
          description: "The scraper couldn't find products in this category. AliExpress may have changed its page structure.",
          variant: "destructive",
        });
      } else {
        toast({
          title: `${data.totalFound} products found`,
          description: `Best sellers in ${data.category}`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function handleCategorySelect(categoryId: string) {
    setSelectedCategory(categoryId);
    setCurrentPage(1);
    setScrapeResult(null);
    scrapeMutation.mutate({ categoryId, sortBy, page: 1, minSales, maxPages });
  }

  function handleSortChange(value: string) {
    setSortBy(value);
    setCurrentPage(1);
    if (selectedCategory) {
      scrapeMutation.mutate({ categoryId: selectedCategory, sortBy: value, page: 1, minSales, maxPages });
    }
  }

  function handlePageChange(newPage: number) {
    setCurrentPage(newPage);
    if (selectedCategory) {
      scrapeMutation.mutate({ categoryId: selectedCategory, sortBy, page: newPage, minSales, maxPages });
    }
  }

  function handleRetry() {
    if (selectedCategory) {
      scrapeMutation.mutate({ categoryId: selectedCategory, sortBy, page: currentPage, minSales, maxPages });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">AliExpress Scraper</h1>
                <p className="text-xs text-muted-foreground">Discover best-selling products by category</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="gap-1">
                <Zap className="w-3 h-3" />
                ScraperAPI
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Globe className="w-3 h-3" />
                Live
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <section data-testid="section-categories">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <h2 className="text-lg font-semibold">Categories</h2>
            {selectedCategoryData && (
              <Badge variant="secondary">
                {selectedCategoryData.name}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {aliexpressCategories.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                isSelected={selectedCategory === cat.id}
                onClick={() => handleCategorySelect(cat.id)}
              />
            ))}
          </div>
        </section>

        {selectedCategory && (
          <section className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <Select value={sortBy} onValueChange={handleSortChange}>
                <SelectTrigger className="w-[200px]" data-testid="select-sort-trigger">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="orders">Most Sold</SelectItem>
                  <SelectItem value="price_asc">Price: Low to High</SelectItem>
                  <SelectItem value="price_desc">Price: High to Low</SelectItem>
                  <SelectItem value="rating">Best Rating</SelectItem>
                </SelectContent>
              </Select>
              <Filter className="w-4 h-4 text-muted-foreground ml-2" />
              <Select value={String(minSales)} onValueChange={(v) => setMinSales(Number(v))}>
                <SelectTrigger className="w-[160px]" data-testid="select-min-sales">
                  <SelectValue placeholder="Min sales" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">All sales</SelectItem>
                  <SelectItem value="100">100+ sold</SelectItem>
                  <SelectItem value="500">500+ sold</SelectItem>
                  <SelectItem value="1000">1,000+ sold</SelectItem>
                  <SelectItem value="5000">5,000+ sold</SelectItem>
                  <SelectItem value="10000">10,000+ sold</SelectItem>
                </SelectContent>
              </Select>
              <Layers className="w-4 h-4 text-muted-foreground ml-2" />
              <Select value={String(maxPages)} onValueChange={(v) => setMaxPages(Number(v))}>
                <SelectTrigger className="w-[140px]" data-testid="select-max-pages">
                  <SelectValue placeholder="Pages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 page</SelectItem>
                  <SelectItem value="3">3 pages</SelectItem>
                  <SelectItem value="5">5 pages</SelectItem>
                  <SelectItem value="10">10 pages</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scrapeResult && (
              <p className="text-sm text-muted-foreground" data-testid="text-results-count">
                {scrapeResult.totalFound} products found
                {scrapeResult.scrapedAt && ` - scraped ${new Date(scrapeResult.scrapedAt).toLocaleTimeString()}`}
              </p>
            )}
          </section>
        )}

        {scrapeMutation.isPending && (
          <section>
            <div className="flex items-center gap-3 mb-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Scraping AliExpress products ({maxPages} page{maxPages > 1 ? "s" : ""})... This may take {maxPages > 1 ? "1-3 minutes" : "15-30 seconds"}.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductSkeleton key={i} />
              ))}
            </div>
          </section>
        )}

        {!scrapeMutation.isPending && scrapeMutation.isError && (
          <ErrorState
            message={scrapeMutation.error?.message || "Failed to scrape products"}
            onRetry={handleRetry}
          />
        )}

        {!scrapeMutation.isPending && !scrapeMutation.isError && !selectedCategory && (
          <EmptyState />
        )}

        {!scrapeMutation.isPending && !scrapeMutation.isError && scrapeResult && scrapeResult.products.length > 0 && (
          <section data-testid="section-products">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {scrapeResult.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {maxPages <= 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <Badge variant="secondary" className="px-4">
                  Page {currentPage}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= 10}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </section>
        )}

        {!scrapeMutation.isPending && !scrapeMutation.isError && scrapeResult && scrapeResult.products.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Package className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No products found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              The scraper couldn't extract products from this page. AliExpress frequently changes its page structure.
              Try a different category or sorting option.
            </p>
            <Button onClick={handleRetry} variant="outline" data-testid="button-retry-empty">
              Try again
            </Button>
          </div>
        )}
      </main>

      <footer className="border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-muted-foreground">
            AliExpress Scraper - Powered by ScraperAPI
          </p>
          <p className="text-xs text-muted-foreground">
            Data scraped from aliexpress.com - For research purposes only
          </p>
        </div>
      </footer>
    </div>
  );
}
