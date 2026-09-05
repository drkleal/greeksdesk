# GreeksDesk

Private, independently hosted trading desk. This initial release serves the proposed interactive chart layout. It is a design preview, not a live trading-analysis system.

## Included

- Dark chart with colorful upside, downside, and neutral scenarios.
- Supporting exposure bars and source explanations.
- Clearly labeled historical example; no live market data or generated probabilities.
- Password-protected page, health check, Dockerfile, and Fly.io configuration.

## Not yet implemented

Panel uploads, persistent read history, platform capture, AI analysis, live monitoring, and alerts. The recheck control only demonstrates the proposed presentation. Existing analysis apps are untouched.

## Fly.io setup

Deploy this repository with app name `greeksdesk`, internal port `8080`, shared CPU and 512 MB RAM. If that Fly app name is unavailable, change `app` in fly.toml to your actual Fly app name. The eventual custom domain can still be greeksdesk.drklealtrades.com.

Set a strong `DESK_PASSWORD` as a Fly secret before opening the desk. Do not commit passwords or provider tokens. Browser sign-in username: `desk`. Without a configured password the page stays locked and displays setup instructions; the health endpoint remains available.

When using the Fly CLI: `fly secrets set DESK_PASSWORD=YOUR_PASSWORD` followed by `fly deploy`. Enter the real secret securely locally, never in a chat or repository. Use HTTPS for the deployed app.

The domain is not connected by this commit. GitHub push does not itself provision Fly.io or GoDaddy DNS. No AI key is required for this preview.

To increase memory later, update `memory` in fly.toml, then redeploy. A dashboard-only change can be overwritten by this configuration.

## Local use

Requires Node.js 22 or newer. Set DESK_PASSWORD in your local environment, then `npm start`. Open http://localhost:8080. Run `npm test` for server checks.
