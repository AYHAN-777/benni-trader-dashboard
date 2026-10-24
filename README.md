# BENNI Trader Dashboard

Existing BTC/TRY and multi-crypto views remain available at `index.html` and `multi.html`.
The isolated YGGDRASIL research view is `paper.html`.

## Run locally

```sh
python -m http.server 8080 --bind 127.0.0.1
# Open http://127.0.0.1:8080/paper.html
node --test tests/paper.test.cjs
node --check paper.js
```

`paper-data.json` is a **synthetic engineering fixture**, not real market evidence.
The page shows market-candle time separately from report-generation time. A fresh
report containing old market data never appears as a healthy current session.

## Integrate the private research engine

Run `python -m research.prototype --demo --output .paper-runtime/demo` in the
private engine repository, then open the resulting `paper-data.json` using the
file picker. Local imports stay in the browser; there is no upload request.
The same schema supports `historical_replay` and `paper_session` snapshots emitted
by `research.prototype` and `research.paper_session` respectively.

For a static local refresh workflow, copy the engine's allowlisted
`paper-data.json` into this directory. The view checks this relative file every
60 seconds. After a local file import, automatic network refresh pauses until
"Veröffentlichten Snapshot laden" is pressed. Neither the page nor this branch
publishes private snapshots automatically. Review the data before intentionally
committing any replacement to the public repository.

There is no broker connection, order endpoint, leverage control or live toggle.
The frontend rejects invalid modes, risk values, non-finite metrics, conflicting
accounting and malformed chronological folds. Source labels are rendered as
literal text. Checksums are displayed as provenance identifiers; the browser
cannot independently authenticate an external report without the source dataset.

The tree labels describe component responsibilities. This static dashboard does
not certify uptime, sandbox strength, immutable audit storage or strategy edge.
Walk-forward folds start with independent cash and must not be added into a
continuous portfolio. Branches also have independent starting balances.
The internal `buy_hold` strategy is labeled "Always-long mit Risikolimits" because
it applies stops. Walk-forward output separately compares
`passive_matched_return_pct` (passive holding at the same starting allocation) and
`risk_managed_long_return_pct` (always-long with simulator risk limits).

## Validation scope

Node's built-in test runner checks schema rejection, freshness, halted states,
chronological boundaries and rendering through text-only DOM sinks. These are
unit/rendering tests, not a real-browser visual or accessibility certification.

Actual local validation during implementation: 13 Node tests passed and
`node --check paper.js` passed. A Playwright browser smoke test was attempted but
could not launch because the Chromium executable is not installed in this runtime;
no browser screenshots or visual certification are claimed.
