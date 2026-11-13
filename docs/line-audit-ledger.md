# Line-by-line audit ledger

Every source file, read in full, with what was found. "Proven" = a test failed on the
unfixed code and passes after the fix. Started 13 Nov 2026.

Status key: READ = every line read; FIXED = bug fixed with a test; OPEN = found, not yet fixed.

## Backend: Services/Transactions (1,700 lines)

| File | Lines | Status | Findings |
|---|---|---|---|
| TransactionService.cs | 53 | READ | none |
| TransactionService.Create.cs | 333 | READ | T1, T2, T3, T4 |
| TransactionService.Balances.cs | 241 | READ | T5 |
| BalanceLock.cs | 42 | READ | none |
| TransactionService.Delete.cs | 229 | READ | T6 |

Findings (working notes; final wording in the report):
- T1 OPEN: CounterCurrency given without CounterAmount posts the SAME number in the other currency (100 USD = 100 KES).
- T2 OPEN: CounterAmount given without a different CounterCurrency moves a different amount on each side in one currency; the stored row keeps only Amount, so statement != balance.
- T3 OPEN: TransactionType / account type numbers not validated (type 5 is treated as Credit).
- T4 OPEN: TransactionDate accepts any date (year 2090, year 1900).
- T5 OPEN: an Expense leg is accepted by the public posting endpoint with any category id (not checked to exist or belong to the bureau): cash out with no expense record.
- T6 OPEN: reversal reads the transaction before taking the lock; two reversals at the same moment both pass the "already reversed" check -> reversed twice (no row version or unique reference on Transactions).
