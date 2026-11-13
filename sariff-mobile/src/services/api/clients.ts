import { ClientDto, CreateClientDto, PagedResult } from "../../types";
import { apiRequest } from "./core";

// ==================== CLIENTS ====================
export const getClients = (page = 1, pageSize = 20, search = "") =>
  apiRequest<PagedResult<ClientDto>>(
    `/api/client?page=${page}&pageSize=${pageSize}${
      // encoded: a "+" in a phone search arrived as a space, an "&" cut the query
      search ? `&search=${encodeURIComponent(search)}` : ""
    }`
  );
/** Every client, page by page (one page of 500 left client 501 onward out of the pickers). */
export async function getAllClients(): Promise<ClientDto[]> {
  const all: ClientDto[] = [];
  for (let page = 1; page <= 250; page++) {
    const r = await getClients(page, 200);
    const rows: ClientDto[] = r.success ? (r.data as any)?.items || [] : [];
    all.push(...rows);
    const total = (r.data as any)?.totalCount ?? all.length;
    if (!r.success || rows.length < 200 || all.length >= total) break;
  }
  return all;
}
export const getClientById = (id: string) =>
  apiRequest<ClientDto>(`/api/client/${id}`);
export const createClient = (dto: CreateClientDto) =>
  apiRequest<ClientDto>("/api/client", {
    method: "POST",
    body: JSON.stringify(dto),
  });
export const deleteClient = (id: string) =>
  apiRequest<boolean>(`/api/client/${id}`, { method: "DELETE" });
export const getClientLookup = (search = "") =>
  apiRequest<ClientDto[]>(
    `/api/client/lookup${search ? `?search=${search}` : ""}`
  );
export const getClientStatement = (id: string, from?: string, to?: string, currency?: number) => {
  let url = `/api/client/${id}/statement`;
  const params: string[] = [];

  if (from) params.push(`startDate=${from}`);
  if (to) params.push(`endDate=${to}`);
  if (currency !== undefined) params.push(`currency=${currency}`);
  if (params.length) url += `?${params.join("&")}`;

  return apiRequest<any>(url);
};
// ==================== CLIENTS (full CRUD) ====================
export const updateClient = (id: string, dto: any) =>
  apiRequest<any>(`/api/client/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
export const resetClientPassword = (id: string, newPassword: string) =>
  apiRequest<boolean>(`/api/client/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
export const reverseClientTransaction = (clientId: string, transactionId: string, reason: string) =>
  apiRequest<boolean>(`/api/client/${clientId}/transaction/${transactionId}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
export const getClientStats = () => apiRequest<any>('/api/client/stats');
export const convertClientToPermanent = (id: string, password: string) =>
  apiRequest<any>(`/api/client/${id}/convert`, { method: 'POST', body: JSON.stringify({ password }) });
