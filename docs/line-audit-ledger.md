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

## Corrections and the sign-out round (13 Nov)

- AC3: the first test also posted from a till, which the old backfill did count; it passed before the fix, so it proved nothing. Rewritten to the real gap (a wallet-to-wallet move that was reversed) and proven failing alone (b7befa6) before the fix.
- LEN1 (reversal): the first test reversed a client posting, which the general reversal always refuses, so it failed for the wrong reason. Moved to cash-to-bank, proven failing with the old reversal text restored for one run, then fixed (c44e9b6).
- An older test expected the category name "Fuel#2" to be refused; that was the letters-only rule replaced under AC1. It now expects acceptance, and script is still refused.

| Id | Bug | Fix |
|---|---|---|
| LO1 | Signing out on one office device ended EVERY session of the bureau. Both apps sign out by themselves after a few idle minutes (3 on the phone), so an idle counter tablet logged the back office out mid-work | The apps send their own refresh token and only that session ends; without a token the old behaviour stays |

## Mobile (14,621 lines) — in progress

When these were found there was no React Native test harness, so they were fixed by reading. Since 14 Nov the phone screens run in tests/screens (phone-kit.js) and each fix below is proven there: see "Proof of the fixes first made by reading" at the end.

| Id | Bug | Fix |
|---|---|---|
| M1 | The posting form loaded only the first 500 clients, and offered switched-off bank accounts, wallets and archived clients | Every client, page by page; only active accounts |
| M2 | Screens cache data (dashboard balances) under keys not tied to the account. Sign-out cleared the cache, but session expiry and a new sign-in did not, so the next person on the phone could see the previous account's figures | Cleared on expiry and on every sign-in |
| M3 | Closing the PIN box after starting a reversal left the reversal pending; entering the PIN for the next NEW transaction then started that old reversal instead of saving the transaction | Cleared when the box closes and when a new transaction starts |
| M4 | Making a walk-in client permanent set the password "Change@123" for every client (and the server texted it). Anyone with a client's code and phone number could sign in as them. The web asks staff for the password | The phone asks for the password too |
| M5 | The client search was sent unencoded: "+" in a phone number arrived as a space and "&" cut the query | Encoded |
| (LO1) | Sign-out sent no token, so it ended every device's session | Sends this phone's refresh token |
| M6 | The exchange client picker searched only the first 200 clients the lookup returns, so client 201 onward could never be picked | The search asks the server (name, phone or code) |
| M7 | Exchange PIN: closing the PIN box after starting a void left the void pending, so the PIN for the next exchange started the old void instead (same as M3) | Cleared when a new exchange starts |
| M8 | Float and expense forms offered switched-off bank accounts and wallets; the expense currency was not tied to the chosen account | Only active accounts; choosing an account sets the currency |
| M9 | The invoices screen loaded the latest 50 invoices, and its "Paid" and "Outstanding" totals were sums of those 50 only | Every invoice, page by page |
| M10 | The invoice client picker showed the first 200 clients, with no search | A search box that asks the server |
| M11 | The phone's transaction search box sent `search`, which the API ignored: typing filtered nothing (proven failing first) | The API searches code, reference and description |

Backend, found while reading the mobile expense form:

| Id | Bug | Fix |
|---|---|---|
| EX7 | A cash expense was paid from the till of the expense's currency, whatever till was chosen: "Cash USD" with the currency left at KES quietly paid from the shilling till (proven failing first, af8fece) | Refused unless the chosen till holds that currency |

| Id | Bug | Fix |
|---|---|---|
| M12 | Every money field read typed text with parseFloat, which stops at the first character it does not understand: "1,500" was recorded as 1, "15o0" as 15. Android number keyboards offer "," and pasted amounts carry thousands separators (proven failing first, f93b931: 9 of 17 cases) | utils/amount.ts parseAmount: commas only as thousands separators, anything else refused; every form refuses text that is not an amount before sending |
| M13 | The SMS code boxes took one digit each, with no one-time-code hint: a code pasted or filled in from the SMS kept only its first digit (proven by a screen test: fails on the old screens, passes now) | A whole code spreads over the boxes; the first box is marked as the one-time-code field (iOS and Android autofill) |
| M14 | The super admin could sign in on the phone and landed in the bureau tabs, where every request is refused (proven by a screen test: fails on the old screens, passes now) | Refused with "the super admin dashboard is on the web"; the session it opened is ended |
| M15 | Phone sign-in: a failing encrypted store left the opening spinner up for good (proven by a screen test: fails on the old screens, passes now) | Falls back to the phone-number step |
| AU5 | React Native's Hermes engine has no crypto.getRandomValues without a polyfill, so [Likely] the AU4 device id came out empty on phones (every office sign-in asked for a code) and the phone-sign-in secret fell back to Math.random. Proven by a screen test | expo-crypto (added through the fix-mobile-deps workflow, which regenerates the lock file on GitHub); no secure source means no trusted device, never Math.random |
| M16 | Receipts and CSV exports on the phone bypassed the token refresh: after the one-hour sign-in they failed with "Server returned 401" (proven by a screen test: fails on the old screens, passes now) | Refresh once on 401, as every other request |
| M17 | A Render outage page (HTML) showed as "JSON Parse error: Unexpected character <" (proven by a screen test: fails on the old screens, passes now) | Plain message: the server is starting or unavailable |
| M18 | Unused helpers that would mislead: daily summaries sent startDate/endDate (the API reads from/to); "getMonthlyReport" fetched one day (proven by a screen test: fails on the old screens, passes now) (route/parameter cross-check script over both apps) | Corrected / removed |
| M19 | The phone showed Ugandan shillings with cents ("USh 1,800,000.00") (proven failing first, d7f4552) | Whole shillings; statements, receipts, invoices and WhatsApp confirmations use each currency's decimals |
| M20 | The exchange confirmation sent the received amount as String(n): "15467.5" (proven by a screen test: fails on the old screens, passes now) | Formatted in its currency |
| M21 | Password and email fields let Android keyboards capitalise the first letter (the login password did so whenever shown) (proven by a screen test: fails on the old screens, passes now) | No auto-capitalisation or correction on those fields |
| M22 | A password change ends every session on the server, this phone's too: the client was thrown out at the next tap with "Session expired" (proven by a screen test: fails on the old screens, passes now) (web: W12) | Says so and signs out |
| M23 | Reports: ‹ › changed the date in the heading but left the previous day's figures under it (proven by a screen test: fails on the old screens, passes now) | A new day loads its own report |
| M24 | Reports: switching type quickly could draw one report's answer in another's view (proven by a screen test: fails on the old screens, passes now) | Latest request only |
| M25 | Office dashboard "today" compared the API's UTC date: from 00:00 to 03:00 the night's entries were left out (proven by a screen test: fails on the old screens, passes now) | Local date |
| M26 | Phone sign-in did not clear the screen cache or the home currency like the code+password sign-in (proven by a screen test: fails on the old screens, passes now) | Cleared |
| M27 | The phone's invoice PDF was headed "Sarif · Forex Bureau Services" on every invoice a bureau sent; values were not escaped (proven by a screen test: fails on the old screens, passes now) | The bureau's name, address, phone, tax ID; every value escaped; discount shows its minus |
| M28 | The expense list stopped at the latest 50 and its "total" was of those 50 (proven by a screen test: fails on the old screens, passes now) | Pages on scroll; total from the server |
| M29 | A second invoice started with the first one's client and lines (proven by a screen test: fails on the old screens, passes now) | Form reset |
| M30 | Settle profit for a Ugandan bureau sent currency KES with its USD profit amount (the home-currency chip had the value 0): always refused, and KES accounts were offered (proven by a screen test: fails on the old screens, passes now) | Home currency, default, and "no profit to settle" |
| M31 | One tap on Logout in the More menu signed out mid-shift (proven by a screen test: fails on the old screens, passes now) | Asks first |
| M32 | Alerts: "Read all" disappeared when the loaded page was read even if older pages were not (proven by a screen test: fails on the old screens, passes now) | Stays while more pages exist |
| M33 | Withdrawing float in anything but KES hid mobile-money destinations (UGX float → MTN wallet) (proven by a screen test: fails on the old screens, passes now) | Wallets listed by their own currency |
| M34 | The conversion preview showed × instead of ÷ when the counter account was a Ugandan bureau's UGX (display only) (proven by a screen test: fails on the old screens, passes now) (web: W13) | Compared with the home currency |
| M35 | A client's profile always listed KES ("KES 0.00" for a Ugandan client) (proven by a screen test: fails on the old screens, passes now) | Currencies used |

Read in full (logic; style sheets not audited): services/api/core.ts, auth.ts, clients.ts, invoices.ts; hooks/useAuth.tsx; utils/moneyflow.ts, cache.ts; components/InactivityWrapper.tsx; screens/office/TransactionsScreen.tsx, ClientsScreen.tsx, exchange/hooks/useExchangeScreenState.tsx. Read at logic-line level only (API calls, number parsing, totals): Accounts, Expenses, Reports, Invoices, Reconciliation, both dashboards, statements, alerts, analytics, profile. Not yet read: exchange sections, auth screens (Login, Otp, PhoneLogin), components/ui, utils/notifications and dates, navigation, types.

## Trusted devices (found reading the mobile sign-in) — AU4

| Id | Bug | Fix |
|---|---|---|
| AU4 | A trusted device skips the office/super-admin SMS code, but the server trusted a device id of any length. The phone app made its id with Math.random, kept it in plain storage, and fell back to the constant "unknown-device" when storage failed; the web also used Math.random. A bureau that once trusted "unknown-device" let anyone with its password skip the code (proven failing first) | The server trusts only ids of 16 to 200 characters; both apps make them from secure random bytes (the phone in the encrypted store) and send none rather than a constant; old Math.random ids on the web are replaced (one more SMS code each) |

## Web (48,815 lines) — in progress

| Id | Bug | Fix |
|---|---|---|
| W1 | Tabs share one stored sign-in, but the "one refresh at a time" guard is per tab. When two tabs hit an expired token together both spent the same refresh token; since AU2 (refresh tokens are single-use, atomically) the second was refused, and that tab cleared the stored sign-in, including the token the first tab had just saved: every tab signed out. A regression caused by AU2, proven failing first in tests/app-logic/tabs.test.js | A refused refresh first waits up to 3 s for another tab's new token |
| W2 | The idle sign-out timer ran per tab while the sign-in is shared: an office tab left in the background signed out after 3 minutes, ending the shared session and clearing the stored sign-in, so the tab in use was signed out too. Found (proven by a screen test: fails on the old screens, passes now); the timer lives in a React provider the logic harness cannot run, so NOT proven by a test | Last activity is shared between tabs |
| W3 | The exchange form's client list was the lookup's first 200 clients with no search, so client 201 onward could not be chosen; its float accounts included switched-off bank accounts and wallets | A search box that asks the server; only active accounts |
| W4 | Both apps offered switched-off expense categories, which the API now refuses (EX4) | Only active categories are offered |
| W5 | The bank statement upload split each CSV line on every comma: a quoted "1,500.00" deposit whose description had a comma was dropped, and a "25,000.00" withdrawal was read as 25 (proven failing first, a4ec68d: 0 of 7) | A real CSV splitter; amounts read with thousands separators, "(2,000.00)" and trailing "-"/"DR" as money out; parser moved to lib/statement.ts |
| W6 | Statement dates are written day first in Kenya and Uganda: "13/11/2026" was an invalid date and "05/11/2026" read as 11 May, so the date part of every match score was lost or wrong (proven failing first, 5464384) | Dates read day first (also "07-Nov-2026", "9 Nov 26", M-Pesa "2026-11-08 14:22:10") and stored as YYYY-MM-DD |
| W7 | After an exchange with a client found by search (beyond the first 200), no receipt share was offered: the share looked the client up in the page's first-200 list. "STATEMENT.CSV" was refused for its capital letters (proven by a screen test: fails on the old screens, passes now) | The modal hands over the chosen client; the extension check ignores case |
| SM1 | Statements (web; phone client and account statements): switching currency or period quickly could leave the older answer on screen, KES lines under the USD tab, or client A's statement in client B's sheet (proven by a screen test: fails on the old screens, passes now) | Only the latest request may fill the screen |
| SM2 | Client portal list (web and phone) and its month summary: same race on search and filter chips (proven by a screen test: fails on the old screens, passes now) | Same |
| SM3 | A statement PDF printed with a search or in/out filter on listed the matching lines under the whole period's totals without saying so (proven by a screen test: fails on the old screens, passes now) | The PDF says it is filtered and that totals are for the whole period |
| SM4 | Client list (web, server search per keystroke), transaction list (phone) and the exchange client search: an answer for an earlier spelling could replace the current one (proven by a screen test: fails on the old screens, passes now) | Same latest-answer rule |
| W8 | Client portal (web): "Download statement" and "Print statement" held only the page of transactions on screen, cut at 50, under a "Client Account Statement" heading (proven by a screen test: fails on the old screens, passes now) | Both fetch every transaction matching the filters on screen |
| W9 | The home currency was cached even when its first request failed (KES for good: a Ugandan bureau's figures labelled KES until reload), and an answer for the previous bureau could land after a switch (proven failing first, cbf3df2: 2 of 3; web and phone fixed) | Failed loads not cached; answers from before a sign-out/switch dropped |
| W10 | After the one-hour sign-in every super-admin screen failed ("Request failed with status 401": the 401 body was read before the status, so it never refreshed), and receipt, invoice PDF, statement, CSV and audit-log downloads failed (fetch without refresh) (proven failing first, e207042: 0 of 5) | One authorizedFetch refreshes once; super-admin checks 401 first |
| W11 | A token refresh rebuilt the stored user with id = company id and an empty phone (proven by a screen test: fails on the old screens, passes now) | Keeps what sign-in stored |
| W12 | See M22 (portal password change) (proven by a screen test: fails on the old screens, passes now) | Signs out |
| W13 | See M34 (proven by a screen test: fails on the old screens, passes now) | Home currency |
| W14 | The transaction form asks for "Transaction Date *" but never sent it: a back-dated entry was recorded today (proven by a screen test: fails on the old screens, passes now) | Sent (noon that local day); no future days offered |
| W15 | Cash accounts were listed as "Cash 0" / "Cash 1" in the transaction form (the API sends no name) (proven by a screen test: fails on the old screens, passes now) | Currency code |
| W16 | The WhatsApp confirmation was never offered for a client's UGX or EUR account (only _KES/_USD ids were recognised) (proven by a screen test: fails on the old screens, passes now) | Every currency |
| W17 | On a forex entry the confirmation gave the typed amount in the other side's currency (proven by a screen test: fails on the old screens, passes now) | The client's own amount and currency |
| W18 | Reconciliation "Create Adjustment" said "✓ Adjustment entry created" and created nothing (proven by a screen test: fails on the old screens, passes now) | Says how to clear a variance (expense / transaction); no fake success |
| W19 | "Auto Match All" (or the "a" key) marked every pending transaction matched without comparing anything or asking (proven by a screen test: fails on the old screens, passes now) | Says exactly that and asks |
| W20 | "Accept all suggestions" could match two transactions to one statement line (proven by a screen test: fails on the old screens, passes now) | Strongest pairs first, each used once |
| W21 | "Profile picture updated successfully!" kept it in memory only (proven by a screen test: fails on the old screens, passes now) | Kept on this browser per bureau, and says so |
| W22 | Generated client passwords used Math.random (proven by a screen test: fails on the old screens, passes now) | crypto.getRandomValues |
| W23 | The web refused an invoice without a client email (the API and phone take one) (proven by a screen test: fails on the old screens, passes now) | Optional |
| W24 | Reports "Date Range" (Today by default) filtered nothing (proven by a screen test: fails on the old screens, passes now); the new inDateRange is tested in app-logic | Applied, page resets |
| W25 | The transactions report PDF listed the first 50 of every transaction ever, whatever the filters (proven by a screen test: fails on the old screens, passes now) | Every row on screen |
| W26 | The transactions report's CSV exported the daily summary (proven by a screen test: fails on the old screens, passes now) | The transactions |
| W27 | CSV cells not escaped: quotes broke rows; =,+,@ opened as formulas (proven by a screen test: fails on the old screens, passes now) | Escaped |
| W28 | The web login's code check (letters only, 2-4) refused real codes whose prefix has digits ("24/7 Forex" → 2FK-…) or one letter (proven by a screen test: fails on the old screens, passes now) | Letters and digits, 1-4 |
| W29 | Expenses paid by account transfer were labelled "Credit Card" (proven by a screen test: fails on the old screens, passes now) | Correct label |
| W30 | Super-admin sign-out cleared the browser before asking the server, which then refused (no token): the refresh token stayed valid (proven by a screen test: fails on the old screens, passes now) | Server first |
| W31 | Portal statement PDF/print always showed KES and USD boxes (empty for Ugandan clients) (proven by a screen test: fails on the old screens, passes now) | Currencies held |
| W32 | The portal profile showed KES and USD boxes first for every client, a Ugandan client's UGX under "Other" (proven by a screen test: fails on the old screens, passes now) | Currencies held |
| W33 | Settings client table had KES and USD columns only (proven by a screen test: fails on the old screens, passes now) | One Balances column |
| W34 | Super-admin subscription days rounded milliseconds ("Expired 1 day ago" on the expiry day) (proven by a screen test: fails on the old screens, passes now) | Local calendar days |
| W35 | Cash-flow holdings always showed KES (even at zero) instead of the home currency (proven by a screen test: fails on the old screens, passes now) | Home currency |
| W36 | The client password dialog showed KES and USD balances only (proven by a screen test: fails on the old screens, passes now) | Every currency held |

Read in full: lib/api/core.ts, providers/AuthProvider.tsx (sign-in, refresh, idle timer, device id), components/office/StatementModal.tsx, office/reconciliation/helpers.tsx and hooks/useReconciliationState.tsx (upload and matching), exchange/parts/NewExchangeModal.tsx and hooks/useExchangeSectionState.tsx (submit and share). Every web amount input checked: all are type="number", so a browser never hands over "1,500" (M12 does not apply to the web). Query strings in every lib/api file checked: searches are encoded. Not yet read: the rest.

## Backend found from the apps (13 Nov, later round)

| Id | Bug | Fix |
|---|---|---|
| CL8 | The client portal carried no bureau name: the web statement PDF/print was headed with the CLIENT's own name (a client's sign-in stores it as companyName); phone statements and receipts said "Sarif" (proven failing first, a40a5b9) | Profile and statement carry CompanyName; both apps use it |
| I2 | An invoice's own date (web form "Invoice Date *") was dropped: every invoice was dated now (proven failing first, accfdb9) | Optional InvoiceDate (not future, not after the due date), stored at noon that local day |
| SB1 | A subscription set to expire on a date counted as expired from 03:00 that morning in Nairobi (proven failing first, 100e3ab) | Runs to the end of that local day |

## Coverage at the end of 13 Nov

- Phone (14.8k lines): every file read for logic, including services/api, hooks, utils, components (UI kit by logic lines), navigation, types, and every screen. Style blocks not audited.
- Web (49k lines): read in full: lib/api/*, lib/dates, lib/useBaseCurrency, lib/statement, lib/superadmin-api request helper, providers/AuthProvider, app/login, StatementModal, TransactionDialogs, transaction-form (hook and view), reconciliation (helpers, state, actions, effects, adjustment panel), reports hooks (state/data/effects export parts), invoices hook, expenses state hook, clients state hook, cash data hook, office-shell dashboard hook, settings hook, super-admin state hook, exchange section state and NewExchangeModal, client-portal state/data hooks. Searched by pattern only (not line by line): the remaining section/markup components (about 150 files of JSX), shadcn ui/*.
- Every API path and query parameter used by both apps cross-checked against the controllers by script (scratchpad routes.py): only unused helpers were wrong (M18).

## Web sections read line by line (13 Nov, final round)

Every file under components/*/sections and exchange/parts read in full (portal 7, banks 4, cash 6, clients 5, mpesa 5, expenses 5, exchange 13, invoices 6, reconciliation 15, reports 11, settings 7, transaction-form 3, super-admin 13), checking each label, figure, currency, sign and date against what the server does.

| Id | Bug | Fix |
|---|---|---|
| CL9 | Portal balance chart showed today's balance for all six months, other currencies from today too (proven failing first, d7b18df/33e3657) | Each month's closing balance per currency |
| W37 | Office notes field did not say the client sees the notes (web and phone) (proven by a screen test: fails on the old screens, passes now) | Says so |
| W38 | Portal "Print statement" downloads a PDF (proven by a screen test: fails on the old screens, passes now) | "Download statement" |
| W39 | Portal transaction copy said "Copied" when the clipboard refused (proven by a screen test: fails on the old screens, passes now) | Success or error |
| W40 | Portal analytics growth was green when negative (proven by a screen test: fails on the old screens, passes now) | Red |
| W41 | Bank delete: "permanently remove the account and all associated data"; the server soft-deletes only an account with no transactions (proven by a screen test: fails on the old screens, passes now) | True wording, Inactive for accounts with history |
| W42 | Mobile money agent delete: same promise (proven by a screen test: fails on the old screens, passes now) | Same |
| W43 | Client delete: "permanent", "removes transaction history"; the server refuses non-zero balances, recent or exchange history and keeps postings. Fixed KES/USD boxes in a UGX bureau (proven by a screen test: fails on the old screens, passes now) | Lists the real rules; every currency held |
| W44 | Mobile money net movement card said "Debit - Credit"; it includes the opening balance (proven by a screen test: fails on the old screens, passes now) | "Opening + money in − money out" |
| W45 | Edit agent: networks without wallet currency, networks the bureau can't hold; opening balance without currency (proven by a screen test: fails on the old screens, passes now) | Same list as Add, with currency |
| W46 | Record expense: (the currency list part was not a defect, see W57); changing currency dropped Mobile money even for an MTN UGX wallet; choosing Mobile money silently changed the currency. Expense delete promised a permanent delete (a reversal is posted) (proven by a screen test: fails on the old screens, passes now) | Allowed currencies; wallet-aware; true wording |
| W47 | Quick calculator showed the literal "{baseCode} amount" (proven by a screen test: fails on the old screens, passes now) | Template |
| W48 | New exchange and calculator promised spread x amount profit on purchases (none booked) and the wrong figure on sales (average cost) (proven by a screen test: fails on the old screens, passes now) | Server's own calculation; "None on a purchase" |
| W49 | Set rate started from the USD rate (or 130/140) whatever currency was picked: saving EUR stored USD figures; a EUR save also landed on the USD card (proven by a screen test: fails on the old screens, passes now) | Each currency's live rate, empty if none |
| W50 | Rate history mixed currencies with no currency column (proven by a screen test: fails on the old screens, passes now) | Currency column |
| W51 | Rates under 1 (UGX in a KES bureau) shown as 0.03 in the trade table, detail and history (proven by a screen test: fails on the old screens, passes now) | formatRate (4 decimals) |
| W52 | Current rate card and exchange report did not say which currency the rate quotes (proven by a screen test: fails on the old screens, passes now) | "per USD" |
| W53 | Exchange detail copy said "Copied" when the clipboard refused (proven by a screen test: fails on the old screens, passes now) | Success or error |
| W54 | Invoice duplicate turned UGX/EUR invoices into USD and dropped the tax (proven by a screen test: fails on the old screens, passes now) | Same currency and tax rate |
| W55 | Reconciliation formatCurrency printed Math.abs: a short statement showed a positive variance, an overdrawn balance as money held (proven by a screen test: fails on the old screens, passes now) | Keeps the minus |
| W56 | Reconciliation comparison bar width NaN/negative for a zero or overdrawn balance (proven by a screen test: fails on the old screens, passes now) | Guarded |
| RP1 | Reports P&L: exchange profit always 0 (trades carry "date", the filter read transactionDate/createdAt); the 7-day trend was six placeholder zeros (proven failing first, 7222582) | lib/exchangeProfit.ts, real daily figures |
| SA9 | Bureaus country filter applied to the 10 loaded rows only (proven failing first, 6f37c32: 13, want 1) | Server-side baseCurrency filter |
| W57 | Reports currency filter listed KES and EUR without asking what the bureau may hold. NOT A DEFECT today: a Kenyan bureau holds KES/USD/EUR and a Ugandan one all four, so the list was already right; found when the proof test could not be made to fail | Kept as a guard for a future home currency |
| W58 | Reports mobile money header claimed the home currency for every wallet (proven by a screen test: fails on the old screens, passes now) | "Balance" (each row shows its currency) |
| W59 | Exchange report "USD bought" counted what the bureau SOLD (and the reverse) (proven by a screen test: fails on the old screens, passes now) | "sold to clients" / "bought from clients" |
| W60 | Exchange report profit column showed "KES 0" on purchases (proven by a screen test: fails on the old screens, passes now) | Dash |
| W61 | Profit chart axis printed 0k for amounts under 1,000 (proven by a screen test: fails on the old screens, passes now) | Plain number |
| W62 | Office settings: name editable and saved though every other screen says the administrator sets it; phone editable but never saved (proven by a screen test: fails on the old screens, passes now) | Both read-only |
| W63 | Expense category delete promised a permanent wipe; the server refuses a category with expenses (proven by a screen test: fails on the old screens, passes now) | True wording |
| W64 | Super admin "Money held": a KES M-Pesa wallet at a Ugandan bureau hidden behind a dash, yet counted in Total held (proven by a screen test: fails on the old screens, passes now) | Shown |
| W65 | Super admin overview volume table dropped a currency with no trades this month (proven by a screen test: fails on the old screens, passes now) | Every currency |
| W66 | Subscription fee label hard-coded KES. NOT A DEFECT: the platform currency is KES, the screen reads the same before and after | Uses the constant |

Open, not changed: PUT /api/dashboard/settings still accepts a company Name from an office user (the web no longer sends it). Whether office users may rename their bureau is a product decision.

Coverage now: every web section/part file read line by line in addition to the hooks and lib listed above; shadcn ui/* not audited (library code).


## Proof of the fixes first made by reading (14 Nov)

Every fix that was recorded "by reading" now has a test that draws the real screen (or calls the real hook or API client) with data that shows the defect. Each test was run twice in CI: on the app as it was before the fix, where it must fail on the defect itself, and on the app as it is now, where it must pass.

| Suite | What it runs | Tests | Fail on the old app | Pass now |
|---|---|---|---|---|
| tests/screens/screens.test.js | Web screens, this round (W37-W65, SA9 web part), old app = 963935c | 35 | 35 | 35 |
| tests/screens/earlier.test.js | Web screens and hooks, earlier rounds (W2-W36, SM1-SM4), old app = 65a7e0e | 35 | 35 | 35 |
| tests/screens/phone.test.js | Phone screens, hooks and API client (M13-M35, AU5), old app = 65a7e0e | 26 | 26 | 26 |

How: tests/screens/kit.js compiles the app's own .tsx files on the fly and calls each screen section with a view-model; it reads the element tree as a user would read the page and presses buttons by calling their handlers. Components with state run on a small hook runtime. For the phone, React Native and Expo are replaced by stand-ins (phone-kit.js); the screens, hooks and API client are the app's files, unchanged. The suites run in the CI job "screens" on every push; the proof steps stay in that job.

What proving turned up:

| Id | Finding |
|---|---|
| W64b | NEW DEFECT. The W64 fix was incomplete: a bureau's currency held only as mobile money (a Ugandan bureau's KES M-Pesa wallet) had its whole row dropped from "Money held". The proof test failed on the fixed code. Fixed in holdingsRows |
| W57, W66, W46 (currency list) | Not defects: the test could not be made to fail on the old code, because the old screen was already right for both home currencies |
| AU5 | Was "[Likely], not proven on a device". Proven: without crypto.getRandomValues the old phone secret was 48 identical digits from Math.random plus the time |

Limits, stated plainly: these tests run the screens' logic and text in Node, not pixels in a browser or on a handset. Layout, fonts, colours on a real device, the SMS autofill prompt and biometric prompts are outside them.
