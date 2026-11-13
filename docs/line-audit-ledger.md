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
| ClientController.cs | 132 | READ | none (paging is clamped by the global filter) |
| ClientPortalController.cs | 255 | READ | none |
| BalanceAlertController.cs | 54 | READ | none (see notes) |

6 defects proven, plus 1 hardening item (CL7): each test failed in CI before its fix (commits 133c7e6 and 6be4942).

| Id | Bug | Fix |
|---|---|---|
| CL1 | Editing a client's phone number did nothing: both edit forms send it, the service never read it, and still answered "Client updated successfully". When added, it must also be checked (format, another client's number) and cut a phone login proved on the old number | Saved, checked, and the old number's phone login is cut |
| CL2 | Deactivating a client through edit left their portal sessions open (Archive ended them) | Ended, as Archive does |
| CL3 | Convert-to-permanent, office password reset and the client's own password change accepted passwords over 128 characters (create refuses them) | Same rule everywhere |
| CL4 | Edit stored an ID/passport of any length (create refuses more than 50) | Same limit |
| CL5 | A client of an undefined type (5) could be created: neither permanent nor walk-in | Refused |
| CL6 | Names were stored with surrounding spaces, and a search with a space around the word found nobody (list and lookup) | Trimmed |
| CL7 (hardening, corrected 13 Nov) | The services themselves accepted page 0 and any page size. **Correction:** through the API this was never reachable: a global filter (PagingClampFilter) already clamps `page` and `pageSize` on every endpoint. It was first recorded here as a server error; that was wrong. Not counted as a defect | The services clamp too (cap 500 for clients, 200 for alerts) |

Noted, not changed: statements match a cash till by type and currency, so two tills in the same currency would share one statement (checked in Accounts); the stats' "clients with debit" counts positive balances (the web compensates); stats debit/credit totals include reversed pairs (both legs, so they net out in the balance, but inflate the turnover figures); BalanceAlertController answers 200 even when a rule is refused (the body says success=false, and the web reads it); a duplicate alert with the same title and transaction within an hour is dropped on purpose. Found for the mobile audit: the mobile transaction form loads only the first 500 clients, so client 501 onward cannot be picked there.

## Backend: Services/Accounts (1,331 lines + AccountActivity, new) — complete

| File | Lines | Status | Findings |
|---|---|---|---|
| CashAccountService.cs | 285 | READ | none (one till per currency is enforced by a unique index, which settles the statement question left open under Clients) |
| BankAccountService.cs | 223 | READ, FIXED | AC1, AC2, AC4, CM1 |
| MpesaAgentService.cs | 228 | READ, FIXED | AC1, AC4, AC5, CM1 |
| MobileMoney.cs | 80 | READ, FIXED | AC3 |
| ExpenseService.cs | 515 | READ, FIXED | EX1–EX6, AC2, FL1, LEN1 |

| Id | Bug | Fix |
|---|---|---|
| AC1 | Bank, account-holder and agent names were checked with the rule for people's names: letters only. "I&M Bank" (a major Kenyan bank), "Shop 24", "Amana Forex (K) Ltd" were refused | A business-name rule: any characters, 2 to the column's length, no script |
| AC2 | A switched-off bank account or wallet, or an archived client, still took new postings, expenses, float funding and exchanges. The web hid them; the API and the mobile app did not | Refused with the reason; reversing an old posting still works |
| AC3 | The start-up currency backfill looked only at the sending side of each posting, so a wallet that had only received money (then paid it out) counted as unused and had its UGX history relabelled as KES | Both sides are looked at |
| AC4 | Branch codes and store numbers had no length limit | 50 characters |
| AC5 | An undefined agent type number was stored | Refused |
| CM1 | Phone, e-mail and account numbers were CHECKED trimmed but stored and compared untrimmed, so a trailing space got a second client, bank account or bureau past the duplicate check | Trimmed before checking and storing (clients, portal profile, bank accounts, wallets, bureaus) |
| EX1 | An expense dated in the future or with no date (stored as year 1) was accepted; postings refuse both | Same rule as postings |
| EX2 | Editing an expense skipped every check that recording it applies | Same limits |
| EX3 | Renaming a category was not checked (blank, too long, another category's name); "rent" next to "Rent" was allowed | Checked; names unique ignoring case |
| EX4 | An expense could be booked to a switched-off category | Refused |
| EX6 | An undefined payment-method number was stored | Refused |
| EX5 (hardening) | The expense list service accepted page 0 and any size; the API filter already clamps them | Clamped in the service too; not counted |

## Backend: Services/Reports (453) — complete

| File | Lines | Status | Findings |
|---|---|---|---|
| ReportService.cs | 244 | READ (rewritten 12 Nov) | none new |
| DashboardService.cs | 173 | READ | none |
| CurrencyRollup.cs | 36 | READ | none |
| ReportController.cs | 53 | READ, FIXED | RP1 (not proven, see below) |

RP1, fixed but NOT proven by a test: the daily report with no date asked for the UTC day, which from 00:00 to 03:00 in Nairobi/Kampala is yesterday. Both apps always send a date, so only direct API callers saw it; the test would depend on the time of day it runs. Now the bureau's day.

Noted, not changed: the super-admin "transactions today" also counts removed bureaus' postings.

## Backend: Services/Notifications (509) and the device-token controller — complete

| File | Lines | Status | Findings |
|---|---|---|---|
| NotificationService.cs | 253 | READ, FIXED | NT1 |
| PushNotificationService.cs | 101 | READ | none |
| SmsService.cs | 155 | READ | none (it logs full numbers on success: noted) |
| DeviceTokenController.cs | 76 | READ, FIXED | DT1 |

| Id | Bug | Fix |
|---|---|---|
| NT1 | Every SMS is copied to NotificationLogs, and the copies kept new accounts' passwords and live sign-in codes in plain text | The stored copy blanks the secret |
| DT1 | One phone's push token stayed active for every account ever signed in on it. The app keeps the token after sign-out (its comment said notifications carry no amounts; they do), so after an office tablet changed hands, office balance alerts and the previous client's amounts went to the next user | Registering a token switches it off for every other account; the app's comment corrected |

## Backend: Services/Common (713) — complete

BureauClock, CsvText, RequestMetrics, CodeGenerator and ValidationHelper read in full. Findings: CM1 (above, the trimming gap is in how callers use ValidationHelper) and the code prefix (CP1 below). New helpers: `ValidateLabel` (business names) and `Fit` (text cut to its column).

## Backend: Services/Auth (1,464) — complete (re-read in full; the 13 Nov sign-in audit fixes are not repeated here)

| Id | Bug | Fix |
|---|---|---|
| AU1 | Sign-in routed on the upper-cased code but looked the account up with the code as typed. The mobile app only trims it, and phone keyboards capitalise the first letter, so "Qab-cl-…" was "Invalid credentials". The SMS-code step had the same problem | Code upper-cased and phone trimmed once, used everywhere |
| AU2 | One refresh token sent twice at the same moment opened two sessions (both requests read "not revoked yet") | Taken in one database statement; the second is refused |
| AU3 | Linking a bureau to the phone login kept the old wrong-password count after a lock ran out, so the first typo locked the account for another 30 minutes (fixed for the password sign-in on 13 Nov, missed here) | The count restarts |

Noted, not changed: an OTP can be requested twice in the same instant (two SMS); a revoked phone-login session's access token still works while the same person has another live session (the per-request check is per person, not per session).

## Backend: Services/Admin (2,168) — complete

| Id | Bug | Fix |
|---|---|---|
| CP1 | Bureau names used the person-name rule ("24/7 Forex & Exchange" refused); the code prefix made from a name kept "&" and "(" | Business-name rule; prefix from letters and digits only |
| CP2 | (CM1) a trailing space got a second bureau onto one number | Trimmed |
| CP3 | Tax ID, website and address had no limits or script check | 50 / 255 / 500, checked |
| DUP | New clients, converted clients and new bureaus got their password by SMS twice (the "WhatsApp" notification is SMS now, and a second SMS followed) | One SMS |
| FN2 | A subscription payment of 1500.005 was recorded; reference and notes had no limits | Same amount rule as everywhere; limits |
| AN1 | The super-admin Analytics screen showed "Avg. session 30m" for every platform: a constant, never measured | Reported as not measured |
| BC1 | Both screens offer KES or UGX as a bureau's home currency, but the API accepted USD or EUR, which makes a bureau that trades "USD against USD" | KES or UGX only |
| PG1 (hardening) | Admin, audit, invoice and reconciliation list services accepted page 0 and any size; the API filter already clamps them | Clamped in the services; not counted |

Noted, not changed: the platform "total volume" figures add different currencies (the screens show the per-currency lists instead); a trial bureau never expires unless an expiry date is set; the audit CSV stops at 10,000 rows without saying so; trusted-device ids appear in the audit log.

## Backend: failure paths (every money service) — FL1

| Id | Bug | Fix |
|---|---|---|
| FL1 | When a save failed, the services rolled the database transaction back and then wrote the error to the system log through the SAME context, whose save wrote the half-done posting, expense, exchange or float move again: the money moved although the user was told it failed (and could retry, moving it twice) | Tracked changes are dropped after every rollback |

## Backend: API controllers (2,671) — complete

All 22 controllers read in full. Findings: CC1, DT1 (above), RC1, and RP1 (Reports).

| Id | Bug | Fix |
|---|---|---|
| CC1 | The cash statement accepted the money-in/money-out filter and dropped it (passed null); bank and wallet statements pass it | Passed on |
| RC1 | /api/transaction/recent?count=1000000 loaded and mapped the whole history ("count" is not covered by the paging filter) | 1 to 100 |

## Backend: Middleware (650) and Program.cs (536) — complete

Read in full. No new defect proven. Noted: unexpected InvalidOperationExceptions under 100 characters are shown to the user with a 400 (e.g. "Sequence contains no elements"); a failed 5xx after money was saved releases the idempotency key; the development seed log lists five test clients it never creates.

## Backend: Data (792) — complete

| Id | Bug | Fix |
|---|---|---|
| LEN1 | Text built from user input plus a prefix overflowed its column in PostgreSQL: "REVERSAL: " + a 500-character description, so any posting described in more than 490 characters could never be reversed; "Expense: Rent - " + description, so a long expense description could not be saved; category names were checked to 255 against a 100-character column (a server error) | Built text is cut to the column; category names to 100 |

## Backend: Core (3,458) — complete at declaration level

Enums, entity defaults and every record default were read; DTO and interface bodies were read where the services use them. No defect of their own.
