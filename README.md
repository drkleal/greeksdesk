# GreeksDesk

Private, independently hosted trading desk. This initial release serves the proposed interactive chart layout. It is a design preview, not a live trading-analysis system.

## Included

- Dark chart with colorful upside, downside, and neutral scenarios.
- Supporting exposure bars and source explanations.
- Clearly labeled historical example; no live market data or generated probabilities.
- Password-protected page, health check, Dockerfile, and Fly.io configuration.

## Not yet implemented

Panel uploads, persistent read history, platform capture, AI analysis, live monitoring, and alerts. The scenario recheck control only demonstrates the proposed presentation. Existing analysis apps are untouched.

## Manual provider checks

The connections page now offers Update now (one cycle) and a timed Auto updates switch, default OFF. A cycle covers Quant Data Net Drift and OptionsDepth timestamp availability only. Paid exposure requests are excluded from auto mode until live values and usage are validated. Auto mode requires today's New York date, a visible page, a selected interval (1/5/10 minutes), and a bounded session length (1h/2h/6.5h). It stops on errors, empty responses, date change, hidden page or session limit. This is a browser-tab loop, not an independent background scheduler. No screenshots or generated scenarios are updated by these controls.

Open `/connections` after signing in as `drkleal`. Configure `QUANT_DATA_API_KEY` and `OPTIONSDEPTH_API_KEY` as Fly secrets. Never enter them into the webpage.

Quant Data makes one SPX Net Drift request with a selected session date, all expirations and one-minute buckets. It rebuilds cumulative premium totals from the returned buckets. Compare against identical dashboard filters. Latest values may belong to an incomplete bucket.

OptionsDepth initially checks the documented non-unit-consuming intraday-timeslots endpoint. A separate explicit button retrieves one paid SPX Gamma heatmap sample using a selected timestamp and price range of up to 300 points. Units are not yet verified; compare the provider usage counter before and after. Heatmap prices are not assumed to be strikes or ES levels. Model units, timestamp semantics, and live values must be compared against the platform before further interpretation. No background polling or automatic retry is enabled. Timestamp checks cache for one minute and identical Gamma selections for ten minutes per machine; this is not an account-wide spending cap. Multiple machines can make separate requests.

Provider calls are server-side, require authenticated manual POST requests and do not return upstream error bodies or API keys. Live credentials cannot be validated locally because they are stored only in Fly.io. Verify deployed responses before treating this as an operational integration. Neither connection check changes the historical scenario preview.

## Fly.io setup

Deploy this repository with app name `greeksdesk`, internal port `8080`, shared CPU and 512 MB RAM. If that Fly app name is unavailable, change `app` in fly.toml to your actual Fly app name. The eventual custom domain can still be greeksdesk.drklealtrades.com.

Set a strong `DESK_PASSWORD` as a Fly secret before opening the desk. Do not commit passwords or provider tokens. Browser sign-in username: `drkleal`. Without a configured password the page stays locked and displays setup instructions; the health endpoint remains available.

When using the Fly CLI: `fly secrets set DESK_PASSWORD=YOUR_PASSWORD` followed by `fly deploy`. Enter the real secret securely locally, never in a chat or repository. Use HTTPS for the deployed app.

The domain is not connected by this commit. GitHub push does not itself provision Fly.io or GoDaddy DNS. No AI key is required for this preview.

To increase memory later, update `memory` in fly.toml, then redeploy. A dashboard-only change can be overwritten by this configuration.

## Local use

Requires Node.js 22 or newer. Set DESK_PASSWORD in your local environment, then `npm start`. Open http://localhost:8080. Run `npm test` for server checks.
