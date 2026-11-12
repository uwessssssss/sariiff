import { ExpenseDto, PagedResult } from "../../types";
import { apiRequest } from "./core";

// ==================== EXPENSES ====================
export const getExpenses = (page = 1, pageSize = 20) =>
  apiRequest<PagedResult<ExpenseDto>>(
    `/api/expense?page=${page}&pageSize=${pageSize}`
  );
// ==================== EXPENSES (full CRUD) ====================
export const createExpense = (dto: any) =>
  apiRequest<ExpenseDto>('/api/expense', { method: 'POST', body: JSON.stringify(dto) });
export const updateExpense = (id: string, dto: any) =>
  apiRequest<ExpenseDto>(`/api/expense/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
export const deleteExpense = (id: string) =>
  apiRequest<boolean>(`/api/expense/${id}`, { method: 'DELETE' });
export const getExpenseCategories = () => apiRequest<any[]>('/api/expense/category');
export const createExpenseCategory = (dto: any) =>
  apiRequest<any>('/api/expense/category', { method: 'POST', body: JSON.stringify(dto) });
export const updateExpenseCategory = (id: string, dto: any) =>
  apiRequest<any>(`/api/expense/category/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
export const deleteExpenseCategory = (id: string) =>
  apiRequest<boolean>(`/api/expense/category/${id}`, { method: 'DELETE' });
export const getExpenseStats = () => apiRequest<any>('/api/expense/stats');
