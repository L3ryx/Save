import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { type EtsySearchResponse, type MatchedProduct, type Product } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Star, TrendingUp, Package, ExternalLink, Loader2,
  AlertCircle, ShoppingCart, ArrowRight, Store, Eye,
  ChevronDown, ChevronUp
} from "lucide-react";
import { Link } from "wouter";

function AliExpressMatchCard({ product }: { product: Product }) {
  return (
    <div className="flex gap-3 p-3 rounded-md border bg-card hover:bg-accent/50 transition-colors">
      <div className="w-16 h-16 rounded-md bg-muted flex-shrink-0 overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium line-clamp-2" data-testid={`ali-title-${product.id}`}>
          {product.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm font-bold text-orange-600" data-testid={`ali-price-${product.id}`}>
            {product.price}
          </span>
          {product.orders && (
            <span className="text-xs text-muted-foreground">{product.orders}</span>
          )}
        </div>
        <a
          href={product.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
          data-testid={`ali-link-${product.id}`}
        >
          View on AliExpress <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: MatchedProduct }) {
  const [expanded, setExpanded] = useState(true);
  const hasMatches = match.aliexpressMatches.length > 0;

  return (
    <Card className="overflow-hidden border-card-border" data-testid={`match-card-${match.etsyProduct.id}`}>
      <div className="flex flex-col md:flex-row">
        <div className="md:w-1/3 p-4 border-b md:border-b-0 md:border-r">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="text-xs gap-1">
              <Store className="w-3 h-3" />
              Etsy
            </Badge>
            {hasMatches && (
              <Badge variant="default" className="text-xs gap-1 bg-green-600">
                {match.aliexpressMatches.length} match{match.aliexpressMatches.length > 1 ? "es" : ""}
              </Badge>
            )}
          </div>

          <div className="aspect-square rounded-md bg-muted overflow-hidden mb-3">
            {match.etsyProduct.imageUrl ? (
              <img
                src={match.etsyProduct.imageUrl}
                alt={match.etsyProduct.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-12 h-12 text-muted-foreground" />
              </div>
            )}
          </div>

          <h3 className="text-sm font-semibold line-clamp-3 mb-2" data-testid={`etsy-title-${match.etsyProduct.id}`}>
            {match.etsyProduct.title}
          </h3>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg font-bold" data-testid={`etsy-price-${match.etsyProduct.id}`}>
              {match.etsyProduct.price}
            </span>
          </div>

          {match.etsyProduct.shop && (
            <p className="text-xs text-muted-foreground mb-2">
              by {match.etsyProduct.shop}
            </p>
          )}

          <Badge variant="secondary" className="text-xs mb-3">
            <Eye className="w-3 h-3 mr-1" />
            AI: "{match.searchKeywords}"
          </Badge>

          <a
            href={match.etsyProduct.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`etsy-link-${match.etsyProduct.id}`}
          >
            <Button variant="outline" size="sm" className="w-full gap-2">
              <ExternalLink className="w-3 h-3" />
              View on Etsy
            </Button>
          </a>
        </div>

        <div className="md:w-2/3 p-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between w-full mb-3"
            data-testid={`toggle-matches-${match.etsyProduct.id}`}
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-orange-600" />
              <span className="text-sm font-semibold">
                AliExpress Matches ({match.aliexpressMatches.length})
              </span>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {expanded && (
            <div className="space-y-2">
              {hasMatches ? (
                match.aliexpressMatches.map((ali) => (
                  <AliExpressMatchCard key={ali.id} product={ali} />
                ))
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No matching products found on AliExpress
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function MatchSkeleton() {
  return (
    <Card className="overflow-hidden border-card-border">
      <div className="flex flex-col md:flex-row">
        <div className="md:w-1/3 p-4 border-b md:border-b-0 md:border-r">
          <Skeleton className="h-5 w-20 mb-3" />
          <Skeleton className="aspect-square rounded-md mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-2/3 mb-2" />
          <Skeleton className="h-6 w-1/3 mb-2" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="md:w-2/3 p-4 space-y-2">
          <Skeleton className="h-5 w-40 mb-3" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-md border">
              <Skeleton className="w-16 h-16 rounded-md flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export default function EtsyPage() {
  const [keyword, setKeyword] = useState("");
  const [searchResult, setSearchResult] = useState<EtsySearchResponse | null>(null);
  const { toast } = useToast();

  const searchMutation = useMutation({
    mutationFn: async (params: { keyword: string; maxResults: number }) => {
      const response = await apiRequest("POST", "/api/etsy/search", params);
      return await response.json() as EtsySearchResponse;
    },
    onSuccess: (data) => {
      setSearchResult(data);
      if (data.matches.length === 0) {
        toast({
          title: "No products found",
          description: "ScrapingBee couldn't find products for this keyword on Etsy.",
          variant: "destructive",
        });
      } else {
        const totalMatches = data.matches.reduce((sum, m) => sum + m.aliexpressMatches.length, 0);
        toast({
          title: `${data.matches.length} Etsy products analyzed`,
          description: `Found ${totalMatches} AliExpress matches via AI image analysis`,
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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setSearchResult(null);
    searchMutation.mutate({ keyword: keyword.trim(), maxResults: 12 });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-orange-600 flex items-center justify-center">
                <Store className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Etsy → AliExpress Finder</h1>
                <p className="text-xs text-muted-foreground">Find AliExpress sources for Etsy products via AI</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/">
                <Button variant="outline" size="sm" className="gap-2" data-testid="link-aliexpress">
                  <ShoppingCart className="w-4 h-4" />
                  AliExpress
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <section>
          <form onSubmit={handleSearch} className="flex gap-3 max-w-2xl mx-auto">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search Etsy products (e.g. 'minimalist gold necklace', 'phone case aesthetic')"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="pl-10"
                data-testid="input-etsy-search"
                disabled={searchMutation.isPending}
              />
            </div>
            <Button
              type="submit"
              disabled={searchMutation.isPending || !keyword.trim()}
              className="gap-2"
              data-testid="button-etsy-search"
            >
              {searchMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Search
            </Button>
          </form>
        </section>

        {searchMutation.isPending && (
          <section className="space-y-4">
            <div className="flex items-center gap-3 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Scraping Etsy and analyzing products with AI... This can take 2-5 minutes.
              </p>
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <MatchSkeleton key={i} />
            ))}
          </section>
        )}

        {!searchMutation.isPending && searchMutation.isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold">Search failed</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {searchMutation.error?.message || "An error occurred"}
            </p>
            <Button
              onClick={() => searchMutation.mutate({ keyword: keyword.trim(), maxResults: 12 })}
              variant="outline"
              data-testid="button-retry"
            >
              Try again
            </Button>
          </div>
        )}

        {!searchMutation.isPending && !searchMutation.isError && !searchResult && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Search Etsy products</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Enter a keyword to find Etsy products, then AI will analyze each listing's image and title to find matching products on AliExpress.
            </p>
            <div className="flex gap-2 flex-wrap justify-center mt-2">
              {["minimalist necklace", "phone case aesthetic", "led strip lights", "tote bag canvas"].map(term => (
                <Button
                  key={term}
                  variant="outline"
                  size="sm"
                  onClick={() => { setKeyword(term); searchMutation.mutate({ keyword: term, maxResults: 12 }); }}
                  data-testid={`suggestion-${term.replace(/\s/g, "-")}`}
                >
                  {term}
                </Button>
              ))}
            </div>
          </div>
        )}

        {!searchMutation.isPending && searchResult && searchResult.matches.length > 0 && (
          <section className="space-y-4" data-testid="section-results">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Results for "{searchResult.keyword}"
              </h2>
              <p className="text-sm text-muted-foreground">
                {searchResult.matches.length} products analyzed
                {searchResult.scrapedAt && ` • ${new Date(searchResult.scrapedAt).toLocaleTimeString()}`}
              </p>
            </div>

            {searchResult.matches.map((match) => (
              <MatchCard key={match.etsyProduct.id} match={match} />
            ))}
          </section>
        )}

        {!searchMutation.isPending && searchResult && searchResult.matches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Package className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No products found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              No Etsy products were found for this keyword. Try a different search term.
            </p>
          </div>
        )}
      </main>

      <footer className="border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Etsy → AliExpress Finder - Powered by ScrapingBee AI
          </p>
          <p className="text-xs text-muted-foreground">
            For research purposes only
          </p>
        </div>
      </footer>
    </div>
  );
}
