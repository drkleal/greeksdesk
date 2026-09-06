# GreeksDesk

Private scenario desk at greeksdesk.drklealtrades.com. Sign in as drkleal using DESK_PASSWORD.

## Working desk

Choose a session date, then Update data. Net Drift and model timestamp availability are fetched on demand. Optional Gamma uses one paid heatmap request near SPX (plus provider caching). Analyze selected evidence sends the selected results and chart images to OpenAI and creates a conditional map with at most six source-linked levels. Missing evidence is shown rather than filled with historical example levels.

The default map uses ES. Paste an original ES price chart to build native ES scenarios without an ES–SPX basis. If the instrument/date header is cropped, the chart owner can confirm ES and the selected session; this metadata remains explicitly labeled as owner supplied. Numeric levels must still come from a legible chart. A matched ES–SPX basis is needed only to convert SPX coordinates. After-hours ES is usable directly, but a later ES quote minus frozen cash SPX is not treated as a synchronized basis. The historical design remains at /preview. Connection diagnostics remain at /connections.

Share chart tab uses the browser's screen-sharing picker. While sharing is active, each data update captures the selected surface. Attach or paste PNG/JPEG/WebP images as an alternative. Source URLs open the original platform; a URL does not grant access to signed-in charts. Capture time is not market-data time. Up to four images per read are resized locally before analysis.

Auto is OFF on page load. It runs every 5 or 10 minutes for a selected bounded session, while the tab stays open and using today's New York date; switching to the trading platform does not turn it off. Background browser throttling or computer sleep can delay cycles. Enable Gamma and/or analysis explicitly to include their costs. Auto stops after a failure, page close/reload or session limit. The wall-clock deadline is checked before every request; delayed timers never catch up by issuing a burst of requests. Manual updates use the same loop and replace its pending timer. This is a browser session, not a hosted background collector. It does not trade or send alerts.

Latest 20 reads, including selected chart images, are stored in this browser's IndexedDB on this device; download a read to retain a portable copy. No cross-device history is implemented.

## Secrets and deployment

Fly secrets: DESK_PASSWORD, QUANT_DATA_API_KEY, OPTIONSDEPTH_API_KEY, OPENAI_API_KEY. Optional OPENAI_MODEL overrides gpt-5.4. Never place keys in browser code, source control or chat. OpenAI requests use store:false and include only selected market inputs, images and the prior same-session summary. The app does not fetch arbitrary chart URLs.

Pushes to main run Node tests and deploy via .github/workflows/fly.yml, using GitHub's FLY_API_TOKEN secret. /healthz is public; app and API routes require authentication. Runtime is Node 22 on Fly, internal port 8080, 512MB.

Run node --test locally. npm start requires DESK_PASSWORD. No npm dependencies.

## Interpretation and usage limits

Model output is conditional interpretation, not guaranteed chart extraction or validated trading signals. Check level provenance, price response, timestamp and expiry scope. Signed premium is not automatically directional buying/selling; Gamma heatmap coordinates are not automatically strikes or support/resistance. Generated ES conversions rely on the displayed basis. The ES chart price card uses the screenshot observation, not a relabeled SPX API quote. OptionsDepth forward-session models remain planning context, with their displayed target date, rather than same-session observed ES levels.

Provider caches and analysis concurrency limits apply per machine, not across the account. Separate tabs/devices/machines can incur separate costs. Paid API unit charges are set by the provider; the interface shows request counts rather than an invented dollar estimate. The app does not yet supply a hard account-wide spending cap, live ES/NQ feed, independent browser collector, or persistent cloud history.

Data-only reads use a deterministic source summary without an OpenAI call. They show observed price and Gamma extrema, and leave scenarios insufficient until chart evidence is supplied. Gamma multi-time responses are reduced to the latest returned time at or before the requested timestamp; time slices are never summed.

## Browser chart connector

The optional unpacked Chrome extension in `browser-connector/` captures up to four explicitly selected chart tabs in the same Chrome profile. Download the authenticated `/chart-connector.zip` or load the folder directly via chrome://extensions. Setup is documented at `/connector`. It requires a one-time user installation; it is not silently installed by the app. Select charts again after a browser restart.

Update & analyze captures selected chart viewports, refreshes API sources, and requests analysis. Auto captures on the existing bounded schedule; AI analysis remains opt-in. Selected charts must remain open, signed in and rendered. This does not capture off-screen panels or turn a provider URL into an embedded live panel. Level evidence can open the saved capture in an in-app dialog; the external platform link is separate.

The extension uses Chrome debugger solely for Page.captureScreenshot, validates supported chart URLs before and after capture, and detaches afterward. It does not read cookies or API secrets, activate tabs, navigate, or trade. Both selected Quant Data and OptionsDepth tabs were verified returning captures in the live desk on September 5, 2026. That verifies capture transport, not the accuracy or freshness of every panel's data.
