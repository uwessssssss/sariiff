// The app's API client, one file per area; everything is re-exported here, so imports of services/api keep working.
export { setSessionExpiredCallback, getToken, getRefreshToken, getStoredUser, storeAuth, clearAuth, newIdempotencyKey, submissionKey, withIdempotencyKey, apiRequest } from "./core";
export { login, verifyOtp, logout } from "./auth";
export { getDashboardStats, getCompanyCurrencies, getRecentTransactions } from "./dashboard";
export { getClients, getAllClients, getClientById, createClient, deleteClient, getClientLookup, getClientStatement, updateClient, resetClientPassword, reverseClientTransaction, getClientStats, convertClientToPermanent } from "./clients";
export { getTransactions, createTransaction, getTransactionById, deleteTransaction, updateTransaction, getTransactionPinStatus, verifyTransactionPinBackend } from "./transactions";
export { getBankAccounts, getBankStatement, getMpesaAgents, getMpesaStatement, getCashAccounts, getCashStatement, createBankAccount, updateBankAccount, deleteBankAccount, getBankAccountById, getBankAccountStatement, getBankStats, createMpesaAgent, updateMpesaAgent, deleteMpesaAgent, getMpesaAgentById, getMpesaAgentStatement, getMpesaStats, createCashAccount, updateCashAccount, deleteCashAccount, getCashAccountById, getCashAccountStatement, getCashStats } from "./accounts";
export { getCurrentExchangeRate, setExchangeRate, getExchangeFloat, createExchange, getExchangeTransactions, voidExchange, fundExchangeFloat, withdrawExchangeFloat, settleExchangeProfit, getUsdPosition, getExchangeRateHistory, getExchangeById, calculateExchange, getExchangeDailySummaries, getExchangeTodaySummary, getExchangeProfitReport, getFloatMovements, recordOpeningFloat, recordClosingFloat, updateExchangeAlertThresholds, getTodayFloatSummary, getFloatHistory } from "./exchange";
export { getExpenses, createExpense, updateExpense, deleteExpense, getExpenseCategories, createExpenseCategory, updateExpenseCategory, deleteExpenseCategory, getExpenseStats } from "./expenses";
export { getClientDashboard, getClientProfile, updateClientProfile, getClientTransactions, getClientAlerts, getClientAnalytics, changeClientPassword, getClientPortalStatement, getUnreadAlertsCount, markAlertAsRead, markAllAlertsAsRead, getClientTransactionById } from "./portal";
export { getDailyReport, getExchangeSummary, getAccountSummary, getProfitLoss, getLargeTransactions, getTodayTransactionsSummary } from "./reports";
export { getInvoices, getAllInvoices, createInvoice, getInvoiceById, deleteInvoice, updateInvoiceStatus } from "./invoices";
export { getReconciliations, getReconciliationAccounts, createReconciliation, reconcileTransaction, bulkReconcileTransactions, getAccountReconciliationSummary, getAccountTransactionsForReconciliation, getReconciliationHistory } from "./reconciliation";
export { getMyCompanyInfo, updateMyCompanySettings } from "./settings";
export { getApiBaseUrl, getAuthHeaders, downloadFile, downloadAndShareFile } from "./files";
export { registerDeviceToken, removeDeviceToken, getBalanceAlerts, createBalanceAlert, toggleBalanceAlert, deleteBalanceAlert } from "./alerts";
export { getIdentityDeviceSecret, getRememberedIdentityPhone, rememberIdentityPhone, forgetIdentityDevice, identityEnabled, identityRequestCode, identityVerifyCode, identityDeviceLogin, identityLink, identityPick, hasPhoneLogin, getLinkedBureaus, linkBureau, switchBureauRequest, unlinkBureau, signOutEverywhere, unlinkClientPhoneLogin } from "./identity";
export type { IdentityBureauDto, IdentityTokenDto } from "./identity";
