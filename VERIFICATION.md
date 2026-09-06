# How GreeksDesk verifies its analysis

Status as of September 6, 2026: source and scenario checks are implemented. No trading edge, win rate, or forward performance result has been established. A historical review using the complete session is not an unbiased backtest.

## Implemented checks

- Preserve provider, instrument, contract, observation/session date, expiration, units and the ES–SPX conversion used. Forward expirations and frozen cash anchors are labeled separately.
- Keep QD and OD values on their own scales. Missing data remains missing. Same-provider views of the same family are not additional votes.
- Require level citations. Native ES citations are compared with the actual returned bar, session extremum or trade-derived profile value. The price inspector shows the underlying evidence.
- Check that a conditional route points to cited structural levels in the right direction, retains intervening checkpoints and states confirmation and invalidation. A valid route is not a filled trade.
- Count distinct, unopposed supporting families for stars: three gets one star, four or more gets two. Coordinate proximity and dated context alone cannot earn stars. Stars are not probabilities.
- Display source coverage and exact-price matching separately from outcome validation. Unavailable sources and new inputs without a returned finding remain visible.

These checks catch input, citation and consistency errors. They do not prove every interpretation is correct, establish true dealer inventory, or prove a profitable strategy.

## Required next stage: prospective performance study

This stage is planned, not implemented or completed.

1. Save each version of the plan and its entire evidence snapshot before the market tests its trigger. Keep the creation time, data cut-off time, model version, contract, basis, filters and expirations. Revisions become new records; never rewrite the original prediction.
2. Define the entry rule, completed-bar confirmation, numeric invalidation, targets, expiry time and treatment of gaps before scoring. A vague setup is not eligible for a performance statistic. Record no-trade cases too.
3. Paper-test on later observations. A close-confirmed condition can only trigger after that bar closes; use the next executable observation. When a bar contains both stop and target and the sequence is unknown, mark ambiguous or use a declared conservative rule.
4. Include all eligible signals, failed trades, expired setups and missing-data cases. Declare fees, slippage, contract rolls and session boundaries. Report sample counts, net returns in R, drawdown, adverse/favorable excursion and target-before-invalidation frequency.
5. Evaluate on later, held-out sessions and different market regimes. Compare with simple price-only baselines and remove one evidence family at a time to test whether it adds useful information. Separate development results from held-out results.
6. Publish uncertainty and failure cases. There is no fixed sample count that guarantees an edge; report how limited samples constrain the conclusion. Show calibrated probabilities only after a separate held-out calibration study.

No order placement or brokerage access is required for this process.
