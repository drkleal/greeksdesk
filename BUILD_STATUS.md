# GreeksDesk build status

Updated September 6, 2026. The current reviewed preview uses the September 4 historical session. The complete live workflow and trading performance are not yet validated.

September 7 holiday check, approximately 10:01 ET: Quant Data returned actual SPX option trades through 10:01:26.700 ET and changing Net Drift buckets. Its SPX stock reference stayed at 7,718.60 and is not a live cash observation. Gamma returned values without an observation timestamp; OI-by-expiration and SPY equity prints returned empty for September 7. OptionsDepth rejected the September 7 intraday-timeslots request (400); September 8 returned zero timeslots. Databento live ESU6 requests failed with a licensing-related BentoError; historical metadata ended at 02:01:41 ET. These are bounded checks at that time, not a continuous monitor or proof that every vendor panel has the same status.

The source freshness section now separates observed trade/bucket times, stale ES quotes, unknown model update times, and unavailable providers. It refreshes independently of saved analysis. Databento licensing failures have a specific explanation without exposing SDK error text or credentials.

## Ready to review

- Full-width ES map, Gamma/DEX/Vanna/OI columns, named session/profile references, source inspectors and vertical zoom.
- Separate straddle and VIX daily-range bars. The saved opening premium is 25.20 SPX points; the VIX comparison uses the matching opening observation and 60 prior sessions.
- Five paste areas for DeepGamma, DeepCharts, session/daily volume profile, previous-day profile and multi-day context.
- Per-level confluence records, exact-price citations and distinct-family star rules. Stars appear only when the evidence meets those rules; the current historical read does not qualify for stars.
- Reviewed analysis findings for all 51 supplied sources, including 11 captured panels. Coverage counts 58 of 59 entries as returned findings; one OptionsDepth IV Depth entry is unavailable. Fifteen entries are partial and five are forward-model views.
- All seven ES citations in the latest reviewed response match the saved source prices. All 132 automated software tests pass. The review records citation, duplicate-evidence and interpretation corrections without another paid analysis request.

## Still required

- New DG, DC and profile screenshots for the intended trading session. Their empty paste areas are ready; they cannot supply fresh evidence until images are added. Session/daily VAH and VAL require verified profile values.
- OptionsDepth IV Depth through a supported source or a supplied capture; the current documented API catalogue does not provide it.
- A market-session check of price freshness, ES–SPX time matching, provider date/expiration rollover and refresh behavior together. September 4 historical observations and September 8 projections are kept separate.
- Further scenario-quality work. The newest model response did not justify a complete downside destination; that path remains watch only. Its short POC-to-VWAP stage is not an established entry or a forecast of the full intraday move.
- A prospective paper-trading and outcome-validation workflow. No profitability, win rate, calibrated probability or institutional-grade accuracy claim has been established. See VERIFICATION.md for the study requirements.

The live server rejects invalid generated reads and retains the previous displayed plan. Private rejected-response capture supports review without automatically repeating a paid request. The latest reviewed historical data is currently loaded in the local preview; the preview is distinct from the live application's own saved reads.
