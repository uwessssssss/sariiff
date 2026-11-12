import { AccountType, CURRENCY_META, ClientType, Currency, ExchangeDirection, ExchangeType, PaymentMethod, ReconciliationStatus, TransactionType, UserRole, currencyCode } from "./enums";

// ==============================================
// Helper Functions
// ==============================================

export function formatCurrency(
  amount: number,
  currency: Currency | string,
): string {
  const currencyCode =
    typeof currency === "number"
      ? CURRENCY_META[currency]?.code || "KES"
      : currency;
  // UGX has no minor unit in practice — show whole shillings.
  const decimals = currencyCode === "UGX" ? 0 : 2;
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}
export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-KE").format(num);
}
export function getCurrencyLabel(currency: Currency): string {
  return CURRENCY_META[currency as number]?.code || "KES";
}
export function getTransactionTypeLabel(type: TransactionType): string {
  return type === TransactionType.Debit
    ? "Debit (Money In)"
    : "Credit (Money Out)";
}
export function getAccountTypeLabel(type: AccountType): string {
  const labels: Record<AccountType, string> = {
    [AccountType.Cash]: "Cash",
    [AccountType.Bank]: "Bank",
    [AccountType.Mpesa]: "Mobile money",
    [AccountType.Client]: "Client",
    [AccountType.Expense]: "Expense",
  };
  return labels[type] || "Unknown";
}
export function getPaymentMethodLabel(method: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    [PaymentMethod.Cash]: "Cash",
    [PaymentMethod.Bank]: "Bank Transfer",
    [PaymentMethod.Mpesa]: "Mobile money",
    [PaymentMethod.AccountTransfer]: "Account Transfer",
  };
  return labels[method] || "Unknown";
}
export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    [UserRole.SuperAdmin]: "Super Admin",
    [UserRole.OfficeUser]: "Office User",
    [UserRole.Client]: "Client",
  };
  return labels[role] || "Unknown";
}
export function getClientTypeLabel(type: ClientType): string {
  return type === ClientType.Permanent ? "Permanent" : "Temporary";
}
export function getReconciliationStatusLabel(
  status: ReconciliationStatus,
): string {
  const labels: Record<ReconciliationStatus, string> = {
    [ReconciliationStatus.Pending]: "Pending",
    [ReconciliationStatus.Matched]: "Matched",
    [ReconciliationStatus.Unmatched]: "Unmatched",
  };
  return labels[status] || "Unknown";
}
export function getExchangeTypeLabel(type: ExchangeType): string {
  return type === ExchangeType.Cash ? "Cash" : "From Account";
}
/** "UGX → KES" / "KES → EUR" — pass the exchange's foreign currency (USD when omitted). */
export function getExchangeDirectionLabel(
  direction: ExchangeDirection,
  foreignCurrency: number = Currency.USD,
): string {
  const fx = currencyCode(foreignCurrency);
  return direction === ExchangeDirection.UsdToKes ? `${fx} → KES` : `KES → ${fx}`;
}
