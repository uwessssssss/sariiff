# Line-by-line audit ledger

Every source file, read in full, with what was found. "Proven" = a test failed on the
unfixed code and passes after the fix. Started 13 Nov 2026.

Status key: READ = every line read; FIXED = bug fixed with a test; OPEN = found, not yet fixed.

## Backend: Services/Transactions (1,700 lines) — complete

| File | Lines | Status | Findings |
|---|---|---|---|
| TransactionService.cs | 53 | READ | none |
| TransactionService.Create.cs | 333 | READ, FIXED | T1, T2, T3, T4 |
| TransactionService.Balances.cs | 241 | READ, FIXED | T5 |
| BalanceLock.cs | 42 | READ | none |
| TransactionService.Delete.cs | 229 | READ, FIXED | T6, R4 |
| TransactionService.Queries.cs | 82 | READ, FIXED | Q1, Q2 |
| TransactionService.Summary.cs | 81 | READ, FIXED | S1 |
| ReconciliationService.cs | 439 | READ, FIXED | R1, R3 |
| InvoiceService.cs | 200 | READ, FIXED | I1 (rounding and discount fixed 12 Nov) |

All 13 proven: each had a failing test in LineAuditTransactionsTests before its fix.

| Id | Bug | Fix |
|---|---|---|
| T1 | A posting in two currencies with no amount for the second posted the SAME number in it (USD 100 booked as KES 100) | Refused: the second amount is required |
| T2 | A "counter amount" in the same currency moved 100 on one side and 90 on the other; the row kept only 100, so the statement no longer matched the balance | Refused unless the two amounts are equal |
| T3 | An unknown transaction type number was treated as a Credit | Refused |
| T4 | Any transaction date was accepted (year 2090, year 1900) | Future dates and dates before 2000 refused; back-dating stays |
| T5 | An expense leg was accepted with any category id, even another bureau's: cash could leave a till against nothing | The category must be one of the bureau's own |
| T6 | Reversing the same transaction from several requests at once reversed it every time (6 of 6 in the test): the "already reversed" check ran before any lock | The transaction row is locked first |
| R4 | A reversed posting stayed "pending" in reconciliation for ever, and its reversal counted alone (expected balance off by the amount) | The pair is marked matched and cancels out |
| Q1 | The currency filter on the transaction list missed postings whose second side was in that currency | Matches either side |
| Q2 | Editing a transaction accepted a description or notes of any length | Same limits as when posting (500 / 2,000) |
| S1 | Today's summary showed money moved into the exchange float as both in and out of the till (net 0) | Counted once, as out |
| R1 | A cash count could be saved for an account id that does not exist, or for a client | Only the bureau's own tills |
| R3 | Reconciling a till that received the second currency used the first currency's amount (a shilling bank account showed "USD 100" and expected 100, not 13,000) | Uses the till's own side |
| I1 | An invoice could be linked to another bureau's client id | The client must be the bureau's own |

Noted, not changed (design, not a defect): client accounts may go below zero (overdraft) with no limit; a reconciled transaction can be reversed; office "Credit/Debit" filter means the posting's type.

## Backend: Services/Exchange (2,176 lines) and ExchangeController (358) — complete

| File | Lines | Status | Findings |
|---|---|---|---|
| ExchangeService.cs | 46 | READ | none |
| ExchangeService.Trades.cs | 577 | READ, FIXED | X1, X2, X3, X13, X14 |
| ExchangeService.Helpers.cs | 176 | READ, FIXED | X10 (other currencies) |
| ExchangeService.Currencies.cs | 198 | READ | none |
| ExchangeService.Rates.cs | 117 | READ, FIXED | X5 |
| ExchangeRateService.cs | 129 | READ, FIXED | X4, X5, X15 |
| ExchangeService.Float.cs | 358 | READ, FIXED | X7, X8, X13 |
| ExchangeService.DailyFloat.cs | 257 | READ, FIXED | X9, X10, X11, X13 |
| ExchangeService.Reports.cs | 318 | READ, FIXED | X12 |
| ExchangeController.cs | 358 | READ | none (its checks are repeated in the service) |

All 14 proven: each had a failing test in LineAuditExchangeTests before its fix.

| Id | Bug | Fix |
|---|---|---|
| X1 | An unknown exchange type number was booked like a cash exchange but skipped the "does the float hold enough" check | Refused |
| X2 | Searching exchanges did not find a walk-in customer by name (only registered clients) | The walk-in name is searched too |
| X3 | Voiding a cash exchange went through even when the float no longer held what had to be handed back, leaving the float below zero | Refused, with the amount the float is short |
| X4 | The older rate endpoints reported every rate as USD (a EUR rate read "USD"), and accepted rates of any size | They name the currency and use the same limits |
| X5 | With two active rates for one currency (left by two Set Rate requests at the same moment), the screen could show one rate while trades used the other, and the stale one stayed active for ever | Reads use the newest, the one trades use; setting a rate switches off every older one |
| X7 | Buying float at a rate took a fraction of a cent from the till (1 × 129.535 = 129.535), while the posting was rounded | Rounded once, to cents |
| X8 | Foreign currency moved into the float with no rate set entered at a cost of ZERO; its whole sale price was later booked as profit that could be paid out | Refused until today's rate is set |
| X9 | Once the opening count was recorded, "today's summary" froze: 0 exchanges, no volumes and the morning's float, until the day was closed | An open day is always built live |
| X10 | With no opening count, the day "opened" on the last count ever recorded (even from days before), or else on the balance right now (so opening always equalled closing). Closing without an opening did the same | Opens on the float as it stood when the day began: the balance now minus today's movements |
| X11 | A negative physical count was accepted for other currencies (EUR −5), and for KES/USD when not called through the controller | Refused in every currency |
| X12 | The profit report's daily breakdown grouped by the UTC date: a trade at 00:30 bureau time was reported on the previous day | Grouped by the bureau's calendar day |
| X13 | Exchange notes, float notes, opening/closing notes and void reasons had no length limit; a blank void reason was accepted by the service | 2,000 characters for notes, 500 for a void reason, which is required |
| X14 | A walk-in with a blank name was saved with an empty name | Recorded as "Walk-in Client" |
| X15 | The converter accepted zero and negative amounts | Refused |

Noted, not changed (needs the owner's decision): exchanges can still be made after the day is closed, and those trades appear in no daily summary; an exchange from a client's account may take the float below zero (by design: no cash moves); voided exchanges are hidden from the exchange list; a large-transaction threshold of 0 flags every exchange.

## Backend: Services/Clients (2,755 lines) and the client controllers (441) — complete

| File | Lines | Status | Findings |
|---|---|---|---|
| ClientService.cs | 735 | READ, FIXED | CL1–CL7 |
| StatementHelper.cs | 682 | READ | none confirmed (see notes) |
| ClientAlertHelper.cs | 125 | READ | none |
| BalanceAlertService.cs | 216 | READ (12 Nov bug hunt, fixed then: undefined currency/direction) | none new |
| ClientPortalService.cs and its 7 parts | 997 | READ (12 Nov bug hunt, ledger rewritten then) | CL3 (password), CL7 (alerts paging) |
| ClientController.cs | 132 | READ | CL7 (no paging cap; now in the service) |
| ClientPortalController.cs | 255 | READ | none |
| BalanceAlertController.cs | 54 | READ | none (see notes) |

All 7 proven: each test failed in CI before its fix (commits 133c7e6 and 6be4942).

| Id | Bug | Fix |
|---|---|---|
| CL1 | Editing a client's phone number did nothing: both edit forms send it, the service never read it, and still answered "Client updated successfully". When added, it must also be checked (format, another client's number) and cut a phone login proved on the old number | Saved, checked, and the old number's phone login is cut |
| CL2 | Deactivating a client through edit left their portal sessions open (Archive ended them) | Ended, as Archive does |
| CL3 | Convert-to-permanent, office password reset and the client's own password change accepted passwords over 128 characters (create refuses them) | Same rule everywhere |
| CL4 | Edit stored an ID/passport of any length (create refuses more than 50) | Same limit |
| CL5 | A client of an undefined type (5) could be created: neither permanent nor walk-in | Refused |
| CL6 | Names were stored with surrounding spaces, and a search with a space around the word found nobody (list and lookup) | Trimmed |
| CL7 | Client list and portal alerts had no page cap (pageSize=1000000 loads every client with its totals) and page 0 sent a negative offset, which PostgreSQL refuses (server error) | Page starts at 1; cap 500 for clients (the mobile transaction form asks for 500), 200 for alerts |

Noted, not changed: statements match a cash till by type and currency, so two tills in the same currency would share one statement (checked in Accounts); the stats' "clients with debit" counts positive balances (the web compensates); stats debit/credit totals include reversed pairs (both legs, so they net out in the balance, but inflate the turnover figures); BalanceAlertController answers 200 even when a rule is refused (the body says success=false, and the web reads it); a duplicate alert with the same title and transaction within an hour is dropped on purpose. Found for the mobile audit: the mobile transaction form loads only the first 500 clients, so client 501 onward cannot be picked there.
