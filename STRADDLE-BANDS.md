# Straddle display and per-read records

S is the matched completed-minute call plus put premium, in SPX points.
The board keeps the existing matched price anchor (ES uses the matching ES minute).
Its filled range bar and expected-range boundaries use ±0.85 × S. The visible
label is "1σ (straddle × 0.85) · estimate". This is a user-selected heuristic,
not a calibrated standard deviation or a claim of 68% coverage.
The outer dotted band retains ±S around the same anchor (breakeven width).
Actual option expiration breakevens are strike ±S before costs. Their mapped
ES equivalents are recorded and explicitly distinguished from the price-centered
bands whenever the nearest strike differs from spot. No later basis is substituted.

Each new server read stores result.straddleBands, version 1: selected reference,
recordedAt, instrument/session/source, opening and latest records, observation
and expiration dates, strike, call, put, raw premium, spot, basis, anchor, contract,
0.85 multiplier, both bounds, and actual option breakevens. Missing or future
observations are recorded as unavailable, never zero. This accompanies the read
through browser history, export, private shared sessions and signed recovery.
A later quote refresh or reference selector change does not alter that record.
Older reads display recomputed bands from their saved source inputs but clearly
state that they did not originally record the two-band forecast.

The Scoreboard detail under the straddle summary exposes the frozen bounds.
This change records inputs for subsequent scoring; it does not calculate hit rates.
Future evaluations must distinguish settlement coverage from intraday touches,
keep opening and later forecasts separate, and use only outcomes after each
observation and within its expiration horizon. No scheduled reads are enabled.
