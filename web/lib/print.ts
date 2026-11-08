"use client";

/**
 * Safe printing for HTML built from user data (descriptions, names, references).
 *
 * Two layers:
 *  1. escapeHtml() — every interpolated value is escaped, so "<img onerror=…>"
 *     in a description prints as text.
 *  2. printHtml() — the document is printed from a hidden iframe sandboxed
 *     WITHOUT "allow-scripts": even an unescaped value cannot run code or read
 *     the session stored in localStorage. (The old window.open + document.write
 *     ran on this site's origin with full access.)
 */

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function printHtml(html: string): boolean {
  if (typeof document === "undefined") return false;
  const frame = document.createElement("iframe");
  // allow-same-origin: so this page can call print() on it.
  // allow-modals: browsers block the print dialog in sandboxes without it.
  // NO allow-scripts: nothing inside the printed document can execute.
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.srcdoc = html;

  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return cleanup();
    win.addEventListener("afterprint", cleanup, { once: true });
    setTimeout(() => {
      win.focus();
      win.print();
      // Some browsers never fire afterprint; don't leave the frame behind.
      setTimeout(() => frame.isConnected && frame.remove(), 60_000);
    }, 150);
  };
  document.body.appendChild(frame);
  return true;
}
