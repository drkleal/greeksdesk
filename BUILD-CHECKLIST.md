# GreeksDesk product checklist

User-confirmed requirements, September 6, 2026. This is our independent app; the separate Claude app is a visual reference and must not be modified.

## Evidence and analysis
- Collect the Quant Data and OptionsDepth panel families: Gamma, DEX, Vanna, Charm, positions, open interest, expiration structure, net drift/flow, trade-side statistics, interval changes, institutional prints/dark pools, volatility, and Depth View.
- Accept separate pasted DeepGamma (DG), DeepCharts (DC), and Volume Profile (VP) images. The user supplies these images; there is no assumed API connection to these tools.
- Use Databento for the actual ES contract and session structure. Trade-derived profiles and VWAP must identify their window and completeness. Time-bar estimates must be labeled as estimates.
- Preserve dates, model times, expirations, instruments, participant scope, units and sampling limits. Do not turn unavailable or unreadable values into zeros.
- Review every supplied source; distinguish supporting, opposing, context and unavailable evidence. Multiple views of one underlying dataset are not independent confirmations.
- Build conditional upside/downside/neutral plans from the combined read: what must agree, price confirmation, objectives, intermediate obstacles, invalidation, and what changes the plan. No uncalibrated win probabilities or invented objectives.
- Keep prices in ES. Verify SPX conversion with paired observations; distinguish a dated cash anchor from a current basis. SPY is not automatically SPX times ten.

## Interface
- Give the conditional-path/confluence chart the full screen width.
- Put Gamma, DEX, Vanna and Open Interest bars alongside the aligned price ladder. Concentrations should be visible without clicking.
- Mark accurately named provider levels, session highs/lows, VWAPs, POC, HVN and LVN when supported by source data.
- Use bright, thicker main decision lines and lighter supporting references. Keep the plan readable.
- Label important levels with the actual contributing confluence. Show one gold star for three distinct supporting families and two for four or more. Repeated views and simple coordinate overlaps do not add stars. Keep missing-confluence explanations in the evidence details, off the main chart.
- Show short hover explanations on bars, levels and markers; click to inspect exact values, timestamps, reasoning and original source charts/panels.
- Provide clearly labeled DG, DC and VP paste boxes with preview, replacement, removal, saved drafts and an obvious analysis action.
- Manual Update and Update & analyze; optional Auto with visible freshness, changes, cache/usage information and failure behavior. Pasted images do not refresh automatically.

## Completion checks
- Verify real provider responses and normalization, including unit differences from documentation.
- Test mixed dates, unavailable sources, missing fields, duplicate evidence, wrong contracts and stale basis behavior.
- Inspect the rendered app, chart ranges, hover, click, paste/replacement and responsive layout.
- Verify the deployed version. Report actual coverage and remaining gaps plainly.
- No brokerage connection or automated order placement.

## September 6 comparison review
- Added a left-side premium bar, separate refreshed and fixed 9:36 references, matched-minute VIX ratio, and a 60-session walk-forward comparison. A premium multiple is not labeled a statistical sigma. Missing/imbalanced legs remain unavailable.
- Added a right-side vertical zoom control with reset. Source coordinates stay unchanged as the viewport changes.
- Gamma expiration must be explicit. The next trading expiration is different from the historical session's 0DTE slice. Keep both available; a forward expiration is planning context.
- DEX and Vanna bars show net exposure; overlapping component bars must not hide part of the total. Call and put components remain in the inspector. OI bars retain actual contracts and expiration scope, rather than Greek units.
- Separate paste areas: DeepGamma, DeepCharts, session/daily VP, previous-daily VP, and multi-day profile context. Composite VAH/VAL stay off the chart.
- Remaining data work: session/daily VAH/VAL need an actual profile distribution or readable dated profile; saved POC/HVN/LVN alone cannot recover them. Keep SPY dark pools as related context until a documented, time-matched proxy mapping is supplied. Confirm live-open behavior and model rollover with actual next-session data. Fresh DG/DC/VP images must be analyzed before claiming their agreement.
- Added direct level cards with complete conditional route text, visible nearby GEX/DEX/Vanna/OI values, and source concentration markers. Each exposure series uses its own explicitly labeled visible-range scale. The selected-expiration series is not compressed against all-expiration values.
- Added a separate VIX-scaled daily benchmark bar beside the straddle. Both use the matched observation anchor and retain their different horizons.
- Added Plan verification: returned source coverage, exact cited ES price checks, conditional route status, per-level family counts and an explicit unvalidated outcome status. See VERIFICATION.md for implemented checks and the pending prospective performance study.
- Combined analysis on the expanded packet remains blocked. A controlled diagnostic identified OpenAI HTTP 429 with code credit_balance_exhausted (type insufficient_quota). Prepaid API credits must be replenished before another analysis attempt. The prior successful read remains displayed; no partial result was applied. Provider errors now distinguish credit, spend and usage limits from temporary rate limits without exposing raw account details.
- Remaining presentation work: compact overall plan summary beside the board and continued distinction between forward-model context and observed-session evidence.
