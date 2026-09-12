# Gamma freshness policy

The server evaluates freshness once at read start. The result stores that policy
snapshot, including the exact evaluation time, bands and timestamp provenance.
Signed recovery retains that original policy; opening a saved read does not make
it current. The Source freshness strip shows current eligibility independently.

RTH uses the existing New York cash-session calendar (2026–2028), 09:30–16:00 ET
on full trading days and the actual early close on shortened sessions. Weekends
and listed holidays are outside RTH. Deep Gamma pastes before that day's open
are not used during RTH. Age <=30 minutes is CURRENT; >30 through 90 minutes is
REFERENCE; >90 minutes is NOT USED. Reference supplies slow gamma structure only,
not a pin or 0DTE wall, and receives no independent directional confluence vote.
Excluded images are removed from the model input but retained in the user's saved
charts. Their metadata explains the exclusion. ES/VP pastes have a 24-hour cutoff.

Outside RTH the newest valid DG paste is retained at any age, preserving its
original date/time. Deep Gamma > OptionsDepth > Quant Data is the tie-break order
for comparable gamma evidence. CURRENT DG takes the RTH tie break. Overnight,
newer timestamped gamma exposure takes precedence. Missing timestamps cannot
establish freshness. Paste time measures submission age, not underlying update age.

QD comparison age uses latest returned bucket time, never stockPrice, request time
or flow recency to rejuvenate exposure. OD comparison age uses the actual returned
slot, not the requested slot, expiration, or maximum heatmap projection. A slot
without offset is explicitly assumed ET; the provider timezone remains unverified.
A slot is a model coordinate, not proof of newly observed dealer activity.

Cboe lists SPX GTH as 20:15–09:25 ET:
https://www.cboe.com/about/hours/us-options
The user's OD 04:00-first-slot / static-overnight description is an operating
assumption, not independently verified provider documentation. Consequently
20:15–04:00 does not automatically make an old paste the freshest market observation.
The policy records that window but checks the supplied timestamps before naming
the comparison leader. No unconditional claim that QD and OD update every minute
is made; the app's existing Auto interval and successful requests govern updates.

Manual and Auto reads share the server analyzer, so every invocation uses this
policy, including a read submitted at 07:05 or a checkpoint. There was no fixed
07:05/checkpoint scheduler in this repository at implementation time. Checkpoint
times and trading-day schedule require configuration; this change does not create
or silently enable a recurring paid-analysis schedule.

Tests cover exact age boundaries, before-open pastes, 16:00, 04:00, 20:15,
weekends, holidays, early closes, DST, invalid/future timestamps, the latest paste,
24-hour charts, slots/buckets, leadership, omitted images, model restrictions,
recovery signatures, cache boundary changes, inventory/star exclusion and
cross-session DG restoration. Model-generation tests use mocks and incur no fees.
