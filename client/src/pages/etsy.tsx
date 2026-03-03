import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { type EtsySearchResponse, type MatchedProduct, type Product } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Search, TrendingUp, Package, ExternalLink, Loader2,
  AlertCircle, ShoppingCart, Store, Zap,
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
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Badge variant="outline" className="text-xs gap-1">
              <Store className="w-3 h-3" />
              Etsy
            </Badge>
            {hasMatches && (
              <Badge variant="default" className="text-xs gap-1 bg-green-600">
                {match.aliexpressMatches.length} match{match.aliexpressMatches.length > 1 ? "es" : ""}
              </Badge>
            )}
            {match.matchScore !== undefined && match.matchScore > 0 && (
              <Badge
                variant="secondary"
                className={`text-xs gap-1 ${
                  match.matchScore >= 0.5
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : match.matchScore >= 0.25
                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                }`}
                data-testid={`match-score-${match.etsyProduct.id}`}
              >
                <TrendingUp className="w-3 h-3" />
                {Math.round(match.matchScore * 100)}% match
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
            <Search className="w-3 h-3 mr-1" />
            Keywords: "{match.searchKeywords}"
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

interface AutoDiscoverState {
  isRunning: boolean;
  statusMessage: string;
  currentKeyword: string;
  keywordIndex: number;
  totalKeywords: number;
  matches: MatchedProduct[];
  keywords: string[];
  isComplete: boolean;
  error: string | null;
}

export default function EtsyPage() {
  const [keyword, setKeyword] = useState("");
  const [searchResult, setSearchResult] = useState<EtsySearchResponse | null>(null);
  const [mode, setMode] = useState<"search" | "discover">("search");
  const [autoDiscover, setAutoDiscover] = useState<AutoDiscoverState>({
    isRunning: false,
    statusMessage: "",
    currentKeyword: "",
    keywordIndex: 0,
    totalKeywords: 0,
    matches: [],
    keywords: [],
    isComplete: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);
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
        toast({
          title: `${data.matches.length} Etsy products found`,
          description: `Matched against ${data.totalAliProducts || 0} AliExpress products`,
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const startAutoDiscover = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;

    setAutoDiscover({
      isRunning: true,
      statusMessage: "Starting auto-discover...",
      currentKeyword: "",
      keywordIndex: 0,
      totalKeywords: 0,
      matches: [],
      keywords: [],
      isComplete: false,
      error: null,
    });

    try {
      const response = await fetch("/api/etsy/auto-discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMsg = "Auto-discover request failed";
        try {
          const errData = await response.json();
          errorMsg = errData.message || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            switch (event.type) {
              case "status":
                setAutoDiscover(prev => ({
                  ...prev,
                  statusMessage: event.message,
                  currentKeyword: event.currentKeyword || prev.currentKeyword,
                  keywordIndex: event.keywordIndex ?? prev.keywordIndex,
                }));
                break;

              case "keywords":
                setAutoDiscover(prev => ({
                  ...prev,
                  keywords: event.keywords,
                  totalKeywords: event.total,
                }));
                break;

              case "match":
                setAutoDiscover(prev => ({
                  ...prev,
                  matches: [...prev.matches, event.match],
                }));
                break;

              case "keyword_done":
                setAutoDiscover(prev => ({
                  ...prev,
                  statusMessage: event.found > 0
                    ? `Found ${event.found} match(es) for "${event.keyword}"`
                    : `No good matches for "${event.keyword}"`,
                }));
                break;

              case "keyword_error":
                break;

              case "complete":
                setAutoDiscover(prev => ({
                  ...prev,
                  isRunning: false,
                  isComplete: true,
                  statusMessage: `Done! Found ${event.totalFound} matching products.`,
                }));
                break;

              case "error":
                setAutoDiscover(prev => ({
                  ...prev,
                  isRunning: false,
                  error: event.message,
                  statusMessage: `Error: ${event.message}`,
                }));
                break;
            }
          } catch {}
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        setAutoDiscover(prev => ({
          ...prev,
          isRunning: false,
          statusMessage: "Stopped by user",
        }));
      } else {
        setAutoDiscover(prev => ({
          ...prev,
          isRunning: false,
          error: error.message,
          statusMessage: `Error: ${error.message}`,
        }));
      }
    }
  }, []);

  const stopAutoDiscover = useCallback(() => {
    abortRef.current?.abort();
    setAutoDiscover(prev => ({
      ...prev,
      isRunning: false,
      statusMessage: "Stopped",
    }));
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setSearchResult(null);
    setMode("search");
    searchMutation.mutate({ keyword: keyword.trim(), maxResults: 12 });
  }

  function handleAutoDiscover() {
    setMode("discover");
    setSearchResult(null);
    startAutoDiscover();
  }

  const discoverProgress = autoDiscover.totalKeywords > 0
    ? Math.min(100, (autoDiscover.matches.length / 10) * 100)
    : 0;

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
                <p className="text-xs text-muted-foreground">Find AliExpress sources for Etsy products</p>
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
        <section className="space-y-4">
          <form onSubmit={handleSearch} className="flex gap-3 max-w-2xl mx-auto">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search Etsy products (e.g. 'minimalist gold necklace')"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="pl-10"
                data-testid="input-etsy-search"
                disabled={searchMutation.isPending || autoDiscover.isRunning}
              />
            </div>
            <Button
              type="submit"
              disabled={searchMutation.isPending || autoDiscover.isRunning || !keyword.trim()}
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

          <div className="flex justify-center">
            <Button
              variant="default"
              size="lg"
              className="gap-2 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white"
              onClick={handleAutoDiscover}
              disabled={searchMutation.isPending || autoDiscover.isRunning}
              data-testid="button-auto-discover"
            >
              {autoDiscover.isRunning ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Zap className="w-5 h-5" />
              )}
              Auto-Discover: Find 10 Products Sold on Both
            </Button>
          </div>
        </section>

        {autoDiscover.isRunning && (
          <section className="space-y-4" data-testid="section-auto-discover">
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                    <div>
                      <p className="text-sm font-medium" data-testid="text-discover-status">
                        {autoDiscover.statusMessage}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {autoDiscover.matches.length}/10 products found
                        {autoDiscover.totalKeywords > 0 &&
                          ` | Keyword ${autoDiscover.keywordIndex + 1}/${autoDiscover.totalKeywords}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={stopAutoDiscover}
                    data-testid="button-stop-discover"
                  >
                    Stop
                  </Button>
                </div>
                <Progress value={discoverProgress} className="h-2" />
                {autoDiscover.keywords.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {autoDiscover.keywords.slice(0, 15).map((kw, i) => (
                      <Badge
                        key={kw}
                        variant={i === autoDiscover.keywordIndex ? "default" : i < autoDiscover.keywordIndex ? "secondary" : "outline"}
                        className={`text-xs ${i === autoDiscover.keywordIndex ? "animate-pulse" : ""}`}
                      >
                        {kw}
                      </Badge>
                    ))}
                    {autoDiscover.keywords.length > 15 && (
                      <Badge variant="outline" className="text-xs">
                        +{autoDiscover.keywords.length - 15} more
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {autoDiscover.matches.map((match) => (
              <MatchCard key={match.etsyProduct.id} match={match} />
            ))}

            {autoDiscover.matches.length === 0 && (
              <div className="space-y-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <MatchSkeleton key={i} />
                ))}
              </div>
            )}
          </section>
        )}

        {!autoDiscover.isRunning && mode === "discover" && autoDiscover.matches.length > 0 && (
          <section className="space-y-4" data-testid="section-discover-results">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" data-testid="text-discover-summary">
                      {autoDiscover.isComplete
                        ? `Found ${autoDiscover.matches.length} products sold on both Etsy & AliExpress`
                        : autoDiscover.statusMessage}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Products with 25%+ match score, sorted by best match
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoDiscover}
                  className="gap-2"
                  data-testid="button-discover-again"
                >
                  <Zap className="w-4 h-4" />
                  Run again
                </Button>
              </div>
            </Card>

            {autoDiscover.matches
              .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
              .map((match) => (
                <MatchCard key={match.etsyProduct.id} match={match} />
              ))}
          </section>
        )}

        {searchMutation.isPending && mode === "search" && (
          <section className="space-y-4">
            <div className="flex items-center gap-3 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Scraping Etsy & AliExpress in parallel... This usually takes 30-60 seconds.
              </p>
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <MatchSkeleton key={i} />
            ))}
          </section>
        )}

        {!searchMutation.isPending && searchMutation.isError && mode === "search" && (
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

        {!searchMutation.isPending && !autoDiscover.isRunning && !searchMutation.isError
          && !searchResult && mode === "search" && autoDiscover.matches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Find Etsy products on AliExpress</h3>
            <p className="text-sm text-muted-foreground text-center max-w-lg">
              Search by keyword or use <strong>Auto-Discover</strong> to automatically scrape trending Etsy keywords
              and find 10 products that are also sold on AliExpress.
            </p>
            <div className="flex gap-2 flex-wrap justify-center mt-2">
              {["minimalist necklace", "phone case aesthetic", "led strip lights", "tote bag canvas"].map(term => (
                <Button
                  key={term}
                  variant="outline"
                  size="sm"
                  onClick={() => { setKeyword(term); setMode("search"); searchMutation.mutate({ keyword: term, maxResults: 12 }); }}
                  data-testid={`suggestion-${term.replace(/\s/g, "-")}`}
                >
                  {term}
                </Button>
              ))}
            </div>
          </div>
        )}

        {!searchMutation.isPending && mode === "search" && searchResult && searchResult.matches.length > 0 && (
          <section className="space-y-4" data-testid="section-results">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Results for "{searchResult.keyword}"
              </h2>
              <p className="text-sm text-muted-foreground">
                {searchResult.matches.length} products analyzed
                {searchResult.scrapedAt && ` | ${new Date(searchResult.scrapedAt).toLocaleTimeString()}`}
              </p>
            </div>

            {searchResult.matches.map((match) => (
              <MatchCard key={match.etsyProduct.id} match={match} />
            ))}
          </section>
        )}

        {!searchMutation.isPending && mode === "search" && searchResult && searchResult.matches.length === 0 && (
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

        {autoDiscover.error && !autoDiscover.isRunning && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold">Auto-discover error</h3>
            <p className="text-sm text-muted-foreground">{autoDiscover.error}</p>
            <Button onClick={handleAutoDiscover} variant="outline" data-testid="button-retry-discover">
              Try again
            </Button>
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
