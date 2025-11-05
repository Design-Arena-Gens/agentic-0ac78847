import styles from "./page.module.css";

type CurrencySymbol = "£" | "€" | "$";

type Offer = {
  title: string;
  url: string;
  snippet: string;
  rawPrice: string;
  currency: string;
  priceValue: number;
  priceInGbp: number;
};

const SEARCH_QUERY =
  "Manchester to Lisbon 18 December 2024 flight price 31 December return";

const SEARCH_ENDPOINT = `https://r.jina.ai/https://www.google.com/search?q=${encodeURIComponent(
  SEARCH_QUERY,
)}`;

const FX_RATES: Record<string, number> = {
  GBP: 1,
  EUR: 0.86,
  USD: 0.78,
};

const CURRENCY_BY_SYMBOL: Record<CurrencySymbol, string> = {
  "£": "GBP",
  "€": "EUR",
  $: "USD",
};

export const dynamic = "force-dynamic";

async function fetchSearchSnapshot(): Promise<string> {
  const response = await fetch(SEARCH_ENDPOINT, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
      "Accept-Language": "en-GB,en;q=0.9",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch travel snapshot (${response.status})`);
  }

  return response.text();
}

function splitMarkdownContent(raw: string): string {
  const marker = "Markdown Content:";
  const markerIndex = raw.indexOf(marker);
  if (markerIndex === -1) {
    return raw;
  }

  return raw.slice(markerIndex + marker.length).trim();
}

function normaliseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractPriceCandidates(text: string) {
  const matches = text.matchAll(/([£€$])\s?(\d{1,4}(?:\.\d+)?)/g);
  return Array.from(matches, (result) => ({
    symbol: result[1] as CurrencySymbol,
    amount: parseFloat(result[2]),
    raw: result[0],
  }));
}

function priceToGbp(symbol: CurrencySymbol, amount: number) {
  const currency = CURRENCY_BY_SYMBOL[symbol];
  const rate = FX_RATES[currency] ?? 1;
  return amount * rate;
}

function parseOffers(rawContent: string): Offer[] {
  const content = splitMarkdownContent(rawContent);
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const offers: Offer[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const headingMatch = line.match(
      /^\[###\s*(.+?)\s*\]\((https?:\/\/[^\s)]+)\)/i,
    );

    if (!headingMatch) {
      continue;
    }

    const [, headingTitle, url] = headingMatch;

    if (seen.has(url)) {
      continue;
    }

    const snippetLines: string[] = [];

    for (let offset = 1; offset <= 6; offset++) {
      const candidate = lines[index + offset];
      if (!candidate || candidate.startsWith("[###")) {
        break;
      }
      snippetLines.push(candidate);
    }

    const combinedSource = normaliseWhitespace(
      [headingTitle, ...snippetLines].join(" "),
    );

    const priceCandidates = extractPriceCandidates(combinedSource).filter(
      (item) => item.amount > 0 && item.amount < 2000,
    );

    if (priceCandidates.length === 0) {
      continue;
    }

    const bestCandidate = priceCandidates.reduce((best, current) => {
      const bestGbp = priceToGbp(best.symbol, best.amount);
      const currentGbp = priceToGbp(current.symbol, current.amount);
      return currentGbp < bestGbp ? current : best;
    });

    const currency = CURRENCY_BY_SYMBOL[bestCandidate.symbol];
    const priceInGbp = priceToGbp(bestCandidate.symbol, bestCandidate.amount);

    offers.push({
      title: headingTitle,
      url,
      snippet: normaliseWhitespace(snippetLines.join(" ")),
      rawPrice: bestCandidate.raw,
      currency,
      priceValue: bestCandidate.amount,
      priceInGbp,
    });

    seen.add(url);
  }

  return offers.sort((left, right) => left.priceInGbp - right.priceInGbp);
}

function extractMetaInsights(content: string) {
  const summary: Record<string, string> = {};
  const matchAverage = content.match(
    /Average round-trip price\s*\|\s*([£€$]\s?\d{1,4}(?:\.\d+)?)/i,
  );
  if (matchAverage) {
    summary.averagePrice = matchAverage[1];
  }

  const matchDuration = content.match(
    /Average flight time\s*\|\s*([0-9]+\s*hours?\s*[0-9]*\s*minutes?)/i,
  );
  if (matchDuration) {
    summary.duration = matchDuration[1];
  }

  const matchAirlines = content.match(
    /Fly from Manchester to Lisbon\s*\|\s*([0-9]+)\s*airlines/i,
  );
  if (matchAirlines) {
    summary.airlines = `${matchAirlines[1]} airlines operate`;
  }

  return summary;
}

export default async function Home() {
  const snapshot = await fetchSearchSnapshot();
  const offers = parseOffers(snapshot).slice(0, 6);
  const summary = extractMetaInsights(snapshot);
  const bestOffer = offers[0];

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1>Manchester ✈ Lisbon</h1>
            <p>
              Round trip 18 December 2024 → 31 December 2024 · 1 adult · Economy
            </p>
          </div>
          {bestOffer ? (
            <div className={styles.bestCard}>
              <span className={styles.badge}>Lowest snapshot fare</span>
              <strong className={styles.price}>{bestOffer.rawPrice}</strong>
              <span className={styles.provider}>
                {new URL(bestOffer.url).hostname.replace(/^www\./, "")}
              </span>
            </div>
          ) : (
            <div className={styles.bestCard}>
              <span className={styles.badge}>No live fares found</span>
              <strong className={styles.price}>—</strong>
            </div>
          )}
        </header>

        <section className={styles.meta}>
          <h2>Traveller notes</h2>
          <ul>
            <li>
              {summary.duration
                ? `Typical nonstop time: ${summary.duration}`
                : "Expect roughly a 3 hour nonstop flight."}
            </li>
            <li>
              {summary.averagePrice
                ? `Search-average return fare: ${summary.averagePrice}`
                : "Snapshot averages unavailable; book early for best pricing."}
            </li>
            <li>
              {summary.airlines
                ? summary.airlines
                : "Multiple carriers (e.g. easyJet, Ryanair, TAP) serve the route."}
            </li>
          </ul>
          <p className={styles.disclaimer}>
            Data sourced from public search snippets (Google via r.jina.ai). Use
            as guidance only—confirm availability and final pricing before
            booking.
          </p>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Snapshot deals</h2>
          {offers.length === 0 ? (
            <div className={styles.placeholder}>
              <p>
                No priced offers detected in the latest snapshot. Try refreshing
                or checking directly with airlines and OTAs.
              </p>
            </div>
          ) : (
            <div className={styles.offerGrid}>
              {offers.map((offer) => (
                <article key={offer.url} className={styles.offerCard}>
                  <header className={styles.offerHeader}>
                    <div>
                      <a
                        href={offer.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <h3>{offer.title}</h3>
                      </a>
                      <span className={styles.offerSource}>
                        {new URL(offer.url).hostname.replace(/^www\./, "")}
                      </span>
                    </div>
                    <div className={styles.offerPrice}>
                      <strong>{offer.rawPrice}</strong>
                      {offer.currency !== "GBP" ? (
                        <span>
                          ≈ £{offer.priceInGbp.toFixed(0)} (mid-rate)
                        </span>
                      ) : null}
                    </div>
                  </header>
                  {offer.snippet ? (
                    <p className={styles.offerSnippet}>{offer.snippet}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
