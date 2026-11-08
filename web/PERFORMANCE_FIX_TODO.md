# Performance Fix TODO

## Problem: Loading and section switching is slow

## Root Causes Identified:

1. All 12 office components were eagerly imported (no code splitting)
2. 30-second auto-refresh interval running constantly
3. Heavy components loaded upfront (ClientManagement 2000+ lines)
4. Large commented-out legacy code blocks bloating files

## Fix Plan & Status:

- [x] 1. Convert eager imports to next/dynamic lazy loading (OfficeUserDashboard.tsx)
- [x] 2. Increase auto-refresh interval from 30s → 60s
- [x] 3. Add Suspense loading fallbacks for heavy components
- [x] 4. Strip commented legacy code from all large files
- [x] 5. Add "use client" directive to all office sub-components
- [x] 6. Fix client role redirect bug (app/page.tsx)
- [x] 7. Remove debug console.log statements from AuthProvider
- [x] 8. Delete dead file components/LoginScreen.tsx
- [x] 9. Fix TypeScript errors (invalid props on admin pages, AccountType cast)
- [x] 10. Clean up app/login/page.tsx (remove commented blocks, fix demo notice)

## Files Cleaned:

| File                                   | Before      | After       |
| -------------------------------------- | ----------- | ----------- |
| providers/AuthProvider.tsx             | ~718 lines  | ~260 lines  |
| lib/superadmin-api.ts                  | 1385 lines  | 692 lines   |
| components/LoginScreen.tsx             | 1317 lines  | DELETED     |
| components/OfficeUserDashboard.tsx     | 2480 lines  | ~1290 lines |
| components/ClientUserDashboard.tsx     | 8216 lines  | 2953 lines  |
| components/SuperAdminDashboard.tsx     | 6223 lines  | 3208 lines  |
| components/office/ClientManagement.tsx | 7501 lines  | 3752 lines  |
| components/office/ExchangeSection.tsx  | 7642 lines  | 2563 lines  |
| components/office/TransactionForm.tsx  | 17652 lines | 1292 lines  |
| components/office/Reconciliation.tsx   | 17001 lines | 3924 lines  |
| components/office/MPesaAccounts.tsx    | 5539 lines  | 2875 lines  |
| components/office/Reports.tsx          | 14265 lines | 2810 lines  |
| components/office/ExpensesAccount.tsx  | 3453 lines  | 1739 lines  |

## Remaining (Future):

- [ ] Add React.memo to pure display sub-components
- [ ] Consider splitting ClientManagement.tsx into smaller sub-components
