import { API_BASE, getToken, refreshAuthOnce } from "./core";

// ==================== FILE DOWNLOADS ====================
export function getApiBaseUrl() { return API_BASE; }
export async function getAuthHeaders() {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
// Download a file using auth headers — returns { success, base64?, text?, contentType }
export async function downloadFile(endpoint: string): Promise<{ success: boolean; base64?: string; text?: string; contentType?: string; error?: string }> {
  try {
    const token = await getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let response = await fetch(`${API_BASE}${endpoint}`, { headers });
    if (response.status === 401 && token) {   // expired sign-in: refresh once, like apiRequest
      const latest = await getToken();
      const fresh = latest && latest !== token ? latest : await refreshAuthOnce();
      if (fresh) response = await fetch(`${API_BASE}${endpoint}`, { headers: { ...headers, Authorization: `Bearer ${fresh}` } });
    }
    if (!response.ok) return { success: false, error: `Server returned ${response.status}` };

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('json')) {
      const json = await response.json();
      return { success: true, text: JSON.stringify(json, null, 2), contentType };
    }
    // For binary (PDF, CSV), read as base64
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string)?.split(',')[1] || '';
        resolve({ success: true, base64, contentType });
      };
      reader.onerror = () => resolve({ success: false, error: 'Failed to read file' });
      reader.readAsDataURL(blob);
    });
  } catch (e: any) {
    return { success: false, error: e.message || 'Download failed' };
  }
}
// Download and share a file (PDF, CSV) using expo-file-system + expo-sharing
export async function downloadAndShareFile(endpoint: string, filename: string): Promise<{ success: boolean; error?: string }> {
  try {
    // SDK 54 (expo-file-system 19) moved these functions to /legacy; the main import throws for them.
    const FileSystem = require('expo-file-system/legacy');
    const Sharing = require('expo-sharing');
    const token = await getToken();

    const fileUri = FileSystem.cacheDirectory + filename;
    const fetchTo = (t: string | null) =>
      FileSystem.downloadAsync(`${API_BASE}${endpoint}`, fileUri, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    let downloadResult = await fetchTo(token);
    // The sign-in lasts an hour: a receipt or export asked for after that got "Server
    // returned 401" (this bypassed the refresh every other request gets).
    if (downloadResult.status === 401 && token) {
      const latest = await getToken();
      const fresh = latest && latest !== token ? latest : await refreshAuthOnce();
      if (!fresh) return { success: false, error: 'Your session has ended. Please sign in again.' };
      downloadResult = await fetchTo(fresh);
    }

    if (downloadResult.status !== 200) {
      return { success: false, error: `Server returned ${downloadResult.status}` };
    }

    // Verify the file actually has content. A 200 with an empty body would
    // otherwise "succeed" and share an empty file — the exact symptom of
    // "it exports but there's nothing".
    const info = await FileSystem.getInfoAsync(downloadResult.uri, { size: true });
    if (!info.exists || !info.size || info.size < 64) {
      return {
        success: false,
        error: 'The server returned an empty file — there may be no data for the selected range.',
      };
    }

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: filename.endsWith('.pdf') ? 'application/pdf' : filename.endsWith('.csv') ? 'text/csv' : 'application/octet-stream',
        dialogTitle: filename,
      });
    } else {
      return { success: false, error: 'Sharing is not available on this device.' };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'Download failed' };
  }
}
