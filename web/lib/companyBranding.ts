// The bureau's own details for invoices and the logo, stored on the server (Company:
// LogoUrl, TaxId, Website, Address, Email) — one source for Settings and Invoices.
//
// Before (Nov 2026): Invoices started from hard-coded "SARIF FINTECH / KRA-P051234567X /
// Westlands, Nairobi" for EVERY bureau and its Save button saved nothing; Settings'
// logo upload also only lived in the page. Both now read and write here.
import { getMyCompanyInfo, updateMyCompanySettings } from "@/lib/api";

export interface CompanyBranding {
  name: string;     // set by the super admin
  phone: string;    // the bureau's registered number
  logo: string;     // small data: URL (see shrinkImage) or ""
  address: string;
  email: string;
  website: string;
  taxId: string;    // KRA PIN (Kenya) / URA TIN (Uganda)
}

export const EMPTY_BRANDING: CompanyBranding = { name: "", phone: "", logo: "", address: "", email: "", website: "", taxId: "" };

export async function loadCompanyBranding(): Promise<CompanyBranding> {
  const r = await getMyCompanyInfo();
  const c: any = r.success ? r.data : null;
  if (!c) return EMPTY_BRANDING;
  return {
    name: c.name || "",
    phone: c.whatsAppNumber || "",
    logo: typeof c.logoUrl === "string" && c.logoUrl.startsWith("data:image/") ? c.logoUrl : "",
    address: c.address || "",
    email: c.email || "",
    website: c.website || "",
    taxId: c.taxId || "",
  };
}

/** Save the editable parts. "" clears a field. Returns an error message or null. */
export async function saveCompanyBranding(b: Partial<CompanyBranding>): Promise<string | null> {
  const r = await updateMyCompanySettings({
    ...(b.logo !== undefined ? { logoUrl: b.logo } : {}),
    ...(b.address !== undefined ? { address: b.address.trim() } : {}),
    ...(b.email !== undefined && b.email.trim() ? { email: b.email.trim() } : {}),
    ...(b.website !== undefined ? { website: b.website.trim() } : {}),
    ...(b.taxId !== undefined ? { taxId: b.taxId.trim() } : {}),
  });
  return r.success ? null : r.message || "Couldn't save the company details.";
}

/**
 * Turn an uploaded picture into a small JPEG data: URL (longest side `max` px), so a
 * 5 MB phone photo becomes ~30–80 KB before it is stored and put into every invoice.
 */
export function shrinkImage(file: File, max = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Choose an image file (PNG or JPG)."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); return reject(new Error("This browser can't resize images.")); }
      ctx.fillStyle = "#ffffff"; // transparent logos get a white background in the JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file couldn't be read as an image.")); };
    img.src = url;
  });
}
