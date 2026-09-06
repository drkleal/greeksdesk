# Evidence coverage

Each completed analysis replaces the evidence desk, level key, map and scenarios together. A data-only refresh marks the previous analysis as old. Auto analysis remains opt-in and bounded by its time limit.

## Quant Data

Nine requests per uncached update; server results are reused for 60 seconds. All options requests select SPX and all expirations for the chosen session.

| Source | Request | Interpretation boundary |
| --- | --- | --- |
| Net Drift | One-minute net-drift buckets | Signed premium totals do not establish buying/selling intent. |
| Gamma, Delta, Vanna, Charm | Four exposure-by-strike requests, RAW representation | Apply the documented zero-exposure meaning of omitted legs, then sum across expirations. Explicit null/invalid values remain unknown. Return strongest chain-wide and nearby strikes. These are model references, not automatic walls. No source observation time is supplied for these session snapshots. |
| Gamma, Delta history | Two five-minute interval-map requests | Preserve the last twelve separate buckets. Do not sum time buckets into current exposure or assume their units equal RAW strike exposure. |
| SPY dark-pool levels | One same-session date-range request | Transaction clusters are related-instrument context, not ES levels or directional intent. Omit request-time latestStockPrice from historical results. |
| SPY dark-pool activity | One five-minute dark-flow request | Show recent activity and session notional total; do not infer dealer inventory or trade direction. |

Documentation: [Exposure by strike](https://quantdata.us/api/docs/endpoints/exposure-by-strike), [Interval map](https://quantdata.us/api/docs/endpoints/interval-map), [Dark-pool levels](https://quantdata.us/api/docs/endpoints/dark-pool-levels), [Dark flow](https://quantdata.us/api/docs/endpoints/dark-flow).

## OptionsDepth and charts

OptionsDepth timestamps establish availability only. The optional Gamma request reads one model slice and may consume units; its cache lasts ten minutes. Captured provider panels remain original images. The connector measures visible panel titles and boundaries; hidden/offscreen panels are not automatically captured. The evidence desk explicitly lists captured panels omitted from the analysis. Next-session models are planning context, separate from observed-session prices.

Paid Gamma access was verified on September 6 using the deployed provider reader: one request for September 4 and SPX 7657–7778 returned 4,459 price/time rows. The reader kept 49 prices from the returned 16:00 heatmap time coordinate at or before the requested 17:00 slot, without summing other time coordinates. The provider's `sim_datetime` field has no timezone suffix; it does not establish the model update time or an observed-price timestamp. Values and scaling still require comparison with the matching OptionsDepth display before directional interpretation.

Pasted DeepCharts images provide native ES observations. They remain snapshots until replaced. An ES–SPX conversion requires the existing matched-time basis checks.

## Databento ES prices

The server uses `DATABENTO_API_KEY` only for market data. No brokerage connection, account data or order endpoint is involved. Each update resolves `ES.v.0` through instrument ID to the actual raw contract name, then requests at most 1,500 one-minute bars for the selected session. A named quarterly ES contract may be selected instead. Prices are unadjusted and the contract is displayed.

Before a historical request, the estimated cost must be at most $0.05. Historical results are reused for one hour on the same running server. During the selected current session, a bounded live capture can supply a completed one-second bar; it stops after at most twelve seconds and does not reconnect. This is a price sample per update, not a continuously streaming tick chart. Freshness is calculated from the returned observation time. An older plan never becomes current merely because the price updated.

Server verification on September 6 returned 1,379 ESU6 minute bars for September 4, through 17:00 New York. The final bar closed at 7,715.00 with volume 729, matching the supplied chart. The cost estimate was $0.005034431815. Current-session live behavior remains to be verified when actual market records are available.

## Plan provenance

Level identities distinguish provider-named levels, observed price structure, unidentified drawings, and last quotes. The clean map uses matching Z1/Z2 decision-zone identifiers with the level key. Structural prices within one point form one zone. Unknown drawings and last quotes cannot establish structural scenario boundaries. Routes distinguish the first reaction from a separately conditional broader objective. The previous five-point display cutoff no longer caps or hides the route. Distances are geometric spans between identified levels, not an expected move, entry-to-profit calculation or risk/reward. Arrow targets must agree with direction. Spacing is schematic and explicitly labelled.

Verification on September 6 found 5,283 omitted legs, no explicit nulls, and 561 valid strikes in the September 4 Gamma response. Following the documented omission semantics gives SPX 7720 net raw Gamma +54,655 and SPX 7715 −53,649. Earlier reads used an incorrect omission rule and must be rebuilt. Normalization versions prevent that correction from being reported as market movement.

Truly partial exposure feeds have a visible Partial data badge. Their findings remain reviewable; the badge never implies complete market coverage. A fresh price sample ages into Stale sample after twenty seconds in the browser, without triggering another request.

Scenario drivers link to source findings, including opposing evidence. Unavailable feeds and excluded panels cannot be marked as support; next-session models remain context. SPX prices without a matched ES–SPX basis cannot be described as nearby ES support/resistance, including in narrative drivers. API-only Greek signs remain model context rather than directional confirmation. These checks also apply when displaying saved evidence; older plans require rebuilding. Original-panel viewers distinguish the displayed model date, the analysis session and the capture time. Earlier API observations are supplied for comparisons only within the same selected session and instrument; the analyst must also match filters, units and observation times. Repeated snapshots are not new market movement.

Automated checks verify these mechanics. They do not establish prediction accuracy. New API values still need comparison with the provider UI, and real-time behavior needs observed-session validation.

The analyst returns additional price checkpoints independently of the six displayed map levels. These require the same exact price, identified price response, source and panel checks. Both map levels and checkpoints participate in the nearest-reaction calculation, including obstacles within one point of the trigger. Route arrows retain intermediate checkpoint dots and their source-linked details; an explicitly conditional continuation requires acceptance through the first objective and subsequent checkpoints. Checkpoints are not assumed to be absolute walls or automatic exits. The main map stays limited to six levels, with extra checkpoints available in the Level key and scenario cards. These checks do not prove that the analyst has identified every obstacle.

Full-session ES structure is retained as five-minute and fifteen-minute OHLCV aggregates from the same fetched minute records, with no additional provider request. The latest 120 minute bars remain for local timing. Aggregates expose minuteCount, complete and observedThrough; missing minute slots are not filled and partial aggregates are not presented as confirmed completed candles. Full-session and cash-session ranges are displayed as already observed movement, separate from conditional objectives. Earlier ES comparisons retain prices, timestamps and session statistics without resending the old bar arrays, keeping repeated analysis within the prior-evidence size budget.
