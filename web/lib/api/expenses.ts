import { AccountType, Currency, type CurrencyAmountDto, PaymentMethod } from "./enums";
import { type ApiResponse, type PagedResult, apiRequest } from "./core";

// ==============================================
// Expense Types
// ==============================================

export interface ExpenseCategoryDto {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  totalKES: number;
  totalUSD: number;
  transactionCount: number;
  /** Every currency spent in this category */
  totalsByCurrency?: CurrencyAmountDto[] | null;
}
export interface ExpenseDto {
  id: string;
  code: string;
  categoryId: string;
  categoryName?: string;
  description: string;
  vendorPayee?: string;
  amount: number;
  currency: Currency;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  paymentAccountName?: string;
  reference?: string;
  notes?: string;
  createdAt: string;
  createdByName?: string;
}
export interface CreateExpenseDto {
  categoryId: string;
  description: string;
  vendorPayee?: string;
  amount: number;
  currency: Currency;
  paymentMethod: PaymentMethod;
  paymentAccountType: AccountType;
  paymentAccountId: string;
  reference?: string;
  expenseDate: string;
}
export interface UpdateExpenseDto {
  description?: string;
  vendorPayee?: string;
  amount?: number;
  reference?: string;
}
// ==============================================
// Expense API Functions
// ==============================================

export async function getExpenseCategories(): Promise<
  ApiResponse<ExpenseCategoryDto[]>
> {
  return apiRequest("/api/expense/category");
}
export async function createExpenseCategory(dto: {
  name: string;
  description?: string;
}): Promise<ApiResponse<ExpenseCategoryDto>> {
  return apiRequest("/api/expense/category", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
export async function updateExpenseCategory(
  id: string,
  dto: { name: string; description?: string },
): Promise<ApiResponse<ExpenseCategoryDto>> {
  return apiRequest(`/api/expense/category/${id}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}
export async function deleteExpenseCategory(
  id: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/expense/category/${id}`, { method: "DELETE" });
}
export async function getExpenses(
  page: number = 1,
  pageSize: number = 10,
  filters?: { startDate?: string; endDate?: string; currency?: number },
): Promise<ApiResponse<PagedResult<ExpenseDto>>> {
  let url = `/api/expense?page=${page}&pageSize=${pageSize}`;
  if (filters) {
    if (filters.startDate) url += `&startDate=${filters.startDate}`;
    if (filters.endDate) url += `&endDate=${filters.endDate}`;
    if (filters.currency !== undefined) url += `&currency=${filters.currency}`;
  }
  return apiRequest(url);
}
export async function createExpense(
  dto: CreateExpenseDto,
): Promise<ApiResponse<ExpenseDto>> {
  return apiRequest("/api/expense", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
export async function getExpenseStats(): Promise<ApiResponse<any>> {
  return apiRequest("/api/expense/stats");
}
export async function updateExpense(
  id: string,
  data: UpdateExpenseDto,
): Promise<ApiResponse<ExpenseDto>> {
  return apiRequest<ExpenseDto>(`/api/expense/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
export async function deleteExpense(id: string): Promise<ApiResponse<boolean>> {
  return apiRequest<boolean>(`/api/expense/${id}`, {
    method: "DELETE",
  });
}
