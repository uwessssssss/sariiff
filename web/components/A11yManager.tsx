"use client";

// Keyboard and screen-reader behaviour for the whole app, in one place.
//
// The design review (Nov 2026) found 34 pop-ups built as plain <div class="fixed inset-0">:
// 24 not announced as dialogs, none moving focus in, Tab leaving every one, Escape closing
// only one — plus 46 drop-downs, 22 inputs and 19 icon buttons without an accessible name.
// Rewriting each component would take weeks and miss some; this watches the page and:
//   • pop-ups: marks the panel role="dialog" aria-modal, names it from its heading, moves
//     focus in, keeps Tab inside, closes on Escape (through the pop-up's own Cancel/Close
//     button or backdrop, so the component's own logic runs) and puts focus back;
//   • fields: gives an unnamed <input>/<select>/<textarea> the text of its visible label
//     (or its placeholder);
//   • icon-only buttons: gives them their tooltip, or the meaning of their icon.
// It only ADDS missing attributes; anything a component already sets wins.
import { useEffect } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ICON_NAMES: [RegExp, string][] = [
  [/lucide-x\b|lucide-circle-x|lucide-x-circle/, "Close"],
  [/lucide-trash/, "Delete"],
  [/lucide-pencil|lucide-pen\b|lucide-edit|lucide-square-pen/, "Edit"],
  [/lucide-eye\b/, "View"],
  [/lucide-download/, "Download"],
  [/lucide-printer/, "Print"],
  [/lucide-share/, "Share"],
  [/lucide-copy/, "Copy"],
  [/lucide-refresh|lucide-rotate/, "Refresh"],
  [/lucide-ellipsis|lucide-more-/, "More options"],
  [/lucide-chevron-left|lucide-arrow-left/, "Previous"],
  [/lucide-chevron-right|lucide-arrow-right/, "Next"],
  [/lucide-chevron-down/, "Expand"],
  [/lucide-chevron-up/, "Collapse"],
  [/lucide-search/, "Search"],
  [/lucide-filter|lucide-funnel/, "Filter"],
  [/lucide-menu/, "Menu"],
  [/lucide-bell/, "Notifications"],
  [/lucide-log-out/, "Sign out"],
  [/lucide-plus/, "Add"],
  [/lucide-calendar/, "Choose date"],
  [/lucide-upload/, "Upload"],
  [/lucide-send/, "Send"],
  [/lucide-settings/, "Settings"],
  [/lucide-panel-left/, "Toggle sidebar"],
];

const visible = (el: Element) => {
  const h = el as HTMLElement;
  if (!h.isConnected) return false;
  const cs = getComputedStyle(h);
  return cs.display !== "none" && cs.visibility !== "hidden" && (h.offsetParent !== null || cs.position === "fixed");
};

/** Open pop-ups: fixed full-screen layers that hold a form or buttons (not toasts or spinners). */
function openDialogs(): HTMLElement[] {
  const layers = Array.from(document.querySelectorAll<HTMLElement>("div.fixed.inset-0"))
    .filter((d) => visible(d) && d.getAttribute("aria-hidden") !== "true" && !d.closest("[data-sonner-toaster]"))
    .filter((d) => d.querySelector("button, input, select, textarea"));
  return layers;
}

/** The panel inside a layer: the dialog box itself (first child holding the controls). */
function panelOf(layer: HTMLElement): HTMLElement {
  const own = layer.matches('[role="dialog"],[role="alertdialog"]') ? layer : layer.querySelector<HTMLElement>('[role="dialog"],[role="alertdialog"]');
  if (own) return own;
  const kids = Array.from(layer.children) as HTMLElement[];
  return kids.find((k) => k.querySelector("button, input, select, textarea")) || layer;
}

function nameDialog(panel: HTMLElement) {
  if (!panel.getAttribute("role")) panel.setAttribute("role", "dialog");
  if (!panel.hasAttribute("aria-modal")) panel.setAttribute("aria-modal", "true");
  if (!panel.getAttribute("aria-label") && !panel.getAttribute("aria-labelledby")) {
    const h = panel.querySelector("h1, h2, h3, h4");
    if (h) {
      if (!h.id) h.id = `dlg-title-${Math.random().toString(36).slice(2, 8)}`;
      panel.setAttribute("aria-labelledby", h.id);
    }
  }
}

/** A pop-up bigger than the screen (small phones) scrolls inside itself instead of running off it. */
function fitPanel(layer: HTMLElement, panel: HTMLElement) {
  if (panel === layer) return;
  const r = panel.getBoundingClientRect();
  const vh = window.innerHeight, vw = document.documentElement.clientWidth;
  const layerScrolls = /(auto|scroll)/.test(getComputedStyle(layer).overflowY);
  if ((r.height > vh - 8 || r.top < 0 || r.bottom > vh) && !layerScrolls) {
    let inner = false; // already scrolls inside (header + scrolling body)?
    panel.querySelectorAll<HTMLElement>("*").forEach((el) => { if (!inner && el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) inner = true; });
    if (!inner || r.height > vh) {
      panel.style.maxHeight = "calc(100dvh - 1.5rem)";
      panel.style.overflowY = "auto";
    }
  }
  if (r.width > vw - 8 || r.left < 0 || r.right > vw) {
    panel.style.maxWidth = "calc(100vw - 1rem)";
    panel.style.overflowX = "auto";
  }
}

function labelFields(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("input:not([aria-label]):not([aria-labelledby]), select:not([aria-label]):not([aria-labelledby]), textarea:not([aria-label]):not([aria-labelledby])").forEach((f) => {
    const el = f as HTMLInputElement;
    if (el.type === "hidden" || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return;
    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return;
    const wrap = el.closest("label");
    if (wrap && (wrap.textContent || "").trim()) return;
    // nearest visible label text before the field, in the same small container
    let text = "";
    let box: HTMLElement | null = (wrap || el).parentElement;
    for (let i = 0; i < 3 && box && !text; i++, box = box.parentElement) {
      const lab = Array.from(box.querySelectorAll("label")).find((l) => !l.htmlFor && !l.contains(el) && (l.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
      text = (lab?.textContent || "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
    }
    // a switch (hidden checkbox inside an empty <label>): the row's own text names it
    if (!text && wrap) {
      const row = wrap.parentElement;
      const t = row && Array.from(row.querySelectorAll("p, span, h3, h4, label")).find((n) => !wrap.contains(n) && (n.textContent || "").trim());
      text = (t?.textContent || "").replace(/\s+/g, " ").trim();
    }
    if (!text) text = el.getAttribute("placeholder") || el.getAttribute("title") || "";
    if (!text && el.tagName === "SELECT") text = (el as unknown as HTMLSelectElement).options[0]?.text || "";
    if (text) el.setAttribute("aria-label", text.slice(0, 80));
  });
}

function nameIconButtons(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('button:not([aria-label]):not([aria-labelledby]), [role="button"]:not([aria-label]):not([aria-labelledby])').forEach((b) => {
    if (b.getAttribute("aria-label") || b.getAttribute("aria-labelledby")) return;
    // text that is on screen names the button; text hidden on small screens ("hidden sm:inline") doesn't
    if ((b.innerText || "").trim()) return;
    let name = b.getAttribute("title") || (b.textContent || "").replace(/\s+/g, " ").trim();
    if (!name) {
      const cls = b.querySelector("svg")?.getAttribute("class") || "";
      name = ICON_NAMES.find(([re]) => re.test(cls))?.[1] || "";
    }
    if (name) b.setAttribute("aria-label", name);
  });
}

/** A closed drawer marked aria-hidden must not be reachable with Tab either. */
function inertHidden() {
  document.querySelectorAll<HTMLElement>('[aria-hidden="true"]').forEach((el) => {
    if (!el.hasAttribute("inert") && el.querySelector(FOCUSABLE)) { el.setAttribute("inert", ""); el.dataset.a11yInert = "1"; }
  });
  document.querySelectorAll<HTMLElement>('[data-a11y-inert="1"]').forEach((el) => {
    if (el.getAttribute("aria-hidden") !== "true") { el.removeAttribute("inert"); delete el.dataset.a11yInert; }
  });
}

/** Wide tables scroll sideways: make the scroll box reachable and announced by keyboard. */
function scrollRegions(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".overflow-x-auto").forEach((r) => {
    if (r.scrollWidth > r.clientWidth + 2 && !r.hasAttribute("tabindex")) {
      r.setAttribute("tabindex", "0");
      if (!r.getAttribute("aria-label")) r.setAttribute("aria-label", "Scrollable table");
    }
  });
  // lists that scroll up and down with nothing focusable inside (read-only history)
  root.querySelectorAll<HTMLElement>(".overflow-y-auto, .overflow-auto").forEach((r) => {
    if (r.scrollHeight > r.clientHeight + 2 && !r.hasAttribute("tabindex") && !r.querySelector(FOCUSABLE)) {
      r.setAttribute("tabindex", "0");
      if (!r.getAttribute("aria-label")) r.setAttribute("aria-label", "Scrollable list");
    }
  });
  // chart shapes drawn as images need a name (the series they show)
  root.querySelectorAll<SVGElement>('svg [role="img"]:not([aria-label]), svg[role="img"]:not([aria-label])').forEach((g) => {
    if (!g.querySelector("title")) g.setAttribute("aria-label", g.getAttribute("name") || "Chart");
  });
}

export function A11yManager() {
  useEffect(() => {
    const opener = new WeakMap<HTMLElement, HTMLElement | null>();
    const known = new Set<HTMLElement>();
    let lastFocus: HTMLElement | null = null;
    const trackFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (t && !t.closest("div.fixed.inset-0")) lastFocus = t;
    };

    const sweep = () => {
      const layers = openDialogs();
      for (const layer of layers) {
        if (known.has(layer)) { fitPanel(layer, panelOf(layer)); continue; }
        known.add(layer);
        const panel = panelOf(layer);
        nameDialog(panel);
        fitPanel(layer, panel);
        opener.set(layer, lastFocus);
        // focus into the pop-up unless something inside already has it
        requestAnimationFrame(() => {
          if (layer.contains(document.activeElement)) return;
          const first = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).find((el) => visible(el) && !/close|×|✕/i.test(el.getAttribute("aria-label") || el.textContent || ""))
            || panel.querySelector<HTMLElement>(FOCUSABLE);
          (first || (panel.setAttribute("tabindex", "-1"), panel)).focus({ preventScroll: true });
        });
      }
      // closed pop-ups: give focus back to where it was
      for (const layer of Array.from(known)) {
        if (!layers.includes(layer)) {
          known.delete(layer);
          const back = opener.get(layer);
          if (back && back.isConnected && (!document.activeElement || document.activeElement === document.body)) back.focus({ preventScroll: true });
        }
      }
      labelFields(document);
      nameIconButtons(document);
      scrollRegions(document);
      inertHidden();
    };

    const onKey = (e: KeyboardEvent) => {
      const layers = openDialogs();
      const top = layers[layers.length - 1];
      if (!top) return;
      const panel = panelOf(top);
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        // let the component close itself the way its own buttons do
        const close = Array.from(panel.querySelectorAll<HTMLElement>("button")).find((b) =>
          /^(cancel|close|×|✕|done)$/i.test((b.getAttribute("aria-label") || b.textContent || "").trim()) || /close/i.test(b.getAttribute("aria-label") || ""));
        if (close) { e.preventDefault(); close.click(); return; }
        if (top !== panel) { e.preventDefault(); top.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
        return;
      }
      if (e.key === "Tab") {
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
        if (items.length === 0) { e.preventDefault(); return; }
        const first = items[0], last = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!panel.contains(active)) { e.preventDefault(); first.focus(); return; }
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    };

    // at most one sweep per 150 ms, however busy the page is
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; sweep(); }, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "aria-hidden"] });
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", trackFocus, true);
    sweep();
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", trackFocus, true);
    };
  }, []);
  return null;
}
