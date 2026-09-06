# Evidence coverage

Each completed analysis replaces the evidence desk, level key, map and scenarios together. A data-only refresh marks the previous analysis as old. Auto analysis remains opt-in and bounded by its time limit.

## Quant Data

Nine requests per uncached update; server results are reused for 60 seconds. All options requests select SPX and all expirations for the chosen session.

| Source | Request | Interpretation boundary |
| --- | --- | --- |
| Net Drift | One-minute net-drift buckets | Signed premium totals do not establish buying/selling intent. |
| Gamma, Delta, Vanna, Charm | Four exposure-by-strike requests, RAW representation | Sum only complete call/put pairs across expirations. Return strongest complete strikes. These are model references, not automatic walls. No source observation time is supplied for these session snapshots. |
| Gamma, Delta history | Two five-minute interval-map requests | Preserve the last twelve separate buckets. Do not sum time buckets into current exposure or assume their units equal RAW strike exposure. |
| SPY dark-pool levels | One same-session date-range request | Transaction clusters are related-instrument context, not ES levels or directional intent. Omit request-time latestStockPrice from historical results. |
| SPY dark-pool activity | One five-minute dark-flow request | Show recent activity and session notional total; do not infer dealer inventory or trade direction. |

Documentation: [Exposure by strike](https://quantdata.us/api/docs/endpoints/exposure-by-strike), [Interval map](https://quantdata.us/api/docs/endpoints/interval-map), [Dark-pool levels](https://quantdata.us/api/docs/endpoints/dark-pool-levels), [Dark flow](https://quantdata.us/api/docs/endpoints/dark-flow).

## OptionsDepth and charts

OptionsDepth timestamps establish availability only. The optional Gamma request reads one model slice and may consume units; its cache lasts ten minutes. Captured provider panels remain original images. The connector measures visible panel titles and boundaries; hidden/offscreen panels are not automatically captured. The evidence desk explicitly lists captured panels omitted from the analysis. Next-session models are planning context, separate from observed-session prices.

Pasted DeepCharts images provide native ES observations. They remain snapshots until replaced. An ES–SPX conversion requires the existing matched-time basis checks. An IBKR live ES feed is not implemented in this change.

## Plan provenance

Level identities distinguish provider-named levels, observed price structure, unidentified drawings, and last quotes. The clean map uses matching L1/L2 identifiers with the level key. Unknown drawings and last quotes cannot establish structural scenario boundaries. Arrow target prices must agree with their direction. Spacing is schematic and explicitly labelled.

Scenario drivers link to source findings, including opposing evidence. Unavailable feeds and excluded panels cannot be marked as support; next-session models remain context. Earlier API observations are supplied for comparisons only within the same selected session and instrument; the analyst must also match filters, units and observation times. Repeated snapshots are not new market movement.

Automated checks verify these mechanics. They do not establish prediction accuracy. New API values still need comparison with the provider UI, and real-time behavior needs observed-session validation.
