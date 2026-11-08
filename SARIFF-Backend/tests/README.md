# SARIFF backend tests

```bash
dotnet test
```

That runs the unit tier (in-memory database, no setup):

| File | Covers |
|---|---|
| `StatementTests.cs` | Period statements: opening balance, totals, closing, end-date-includes-whole-day, liability sign, other-currency lines excluded, and random ledgers split at any date joining up exactly |
| `SmallUnitTests.cs` | Subscription blocking (7-day grace, suspended, cancelled), CSV injection safety, code numbering past 9,999, per-bureau series, company prefixes |
| `IdempotencyTests.cs` | Reads never intercepted, successful writes remembered, rejected/crashed writes release the key, anonymous writes untracked |

## Database tier (PostgreSQL)

Some guarantees only exist in PostgreSQL (unique indexes, the atomic code counter).
Point the tests at any PostgreSQL server; each run creates and drops its own database:

```bash
# macOS / Linux
SARIFF_TEST_PG="Host=localhost;Username=postgres;Password=postgres" dotnet test

# Windows PowerShell
$env:SARIFF_TEST_PG="Host=localhost;Username=postgres;Password=postgres"; dotnet test
```

Adds: same key twice → replayed, not run twice; same key on another endpoint → 422;
key still in flight → 409; 200 parallel code requests → 200 different numbers;
counter seeding and self-healing. Without the variable these tests show as skipped.
