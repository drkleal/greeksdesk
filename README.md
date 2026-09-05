# GreeksDesk

Private scenario desk at greeksdesk.drklealtrades.com. Sign in as drkleal using DESK_PASSWORD.

## Working desk

Choose a session date, then Update data. Net Drift and model timestamp availability are fetched on demand. Optional Gamma uses one paid heatmap request near SPX (plus provider caching). Analyze selected evidence sends the selected results and chart images to OpenAI and creates a conditional map with at most six source-linked levels. Missing evidence is shown rather than filled with historical example levels.

The default map uses SPX. ES requires a user-supplied ES-minus-SPX basis; it is not a futures quote feed. The historical design remains at /preview. Connection diagnostics remain at /connections.

Share chart tab uses the browser's screen-sharing picker. While sharing is active, each data update captures the selected surface. Attach or paste PNG/JPEG/WebP images as an alternative. Source URLs open the original platform; a URL does not grant access to signed-in charts. Capture time is not market-data time. Up to four images per read are resized locally before analysis.

Auto is OFF on page load. It runs every 5 or 10 minutes for a selected bounded session, while the page is visible and using today's New York date. Enable Gamma and/or analysis explicitly to include their costs. Auto stops after a failure, hidden page or session limit. This is a browser session, not a hosted background collector. It does not trade or send alerts.

Latest 20 reads, including selected chart images, are stored in this browser's IndexedDB on this device; download a read to retain a portable copy. No cross-device history is implemented.

## Secrets and deployment

Fly secrets: DESK_PASSWORD, QUANT_DATA_API_KEY, OPTIONSDEPTH_API_KEY, OPENAI_API_KEY. Optional OPENAI_MODEL overrides gpt-5.4-mini. Never place keys in browser code, source control or chat. OpenAI requests use store:false and include only selected market inputs, images and the prior same-session summary. The app does not fetch arbitrary chart URLs.

Pushes to main run Node tests and deploy via .github/workflows/fly.yml, using GitHub's FLY_API_TOKEN secret. /healthz is public; app and API routes require authentication. Runtime is Node 22 on Fly, internal port 8080, 512MB.

Run node --test locally. npm start requires DESK_PASSWORD. No npm dependencies.

## Interpretation and usage limits

Model output is conditional interpretation, not guaranteed chart extraction or validated trading signals. Check level provenance, price response, timestamp and expiry scope. Signed premium is not automatically directional buying/selling; Gamma heatmap coordinates are not automatically strikes or support/resistance. Generated ES conversions rely on the entered basis.

Provider caches and analysis concurrency limits apply per machine, not across the account. Separate tabs/devices/machines can incur separate costs. Paid API unit charges are set by the provider; the interface shows request counts rather than an invented dollar estimate. The app does not yet supply a hard account-wide spending cap, live ES/NQ feed, independent browser collector, or persistent cloud history.
