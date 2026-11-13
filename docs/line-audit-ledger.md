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
