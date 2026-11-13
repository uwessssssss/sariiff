import { localDate } from "./dates";

/** Splits one CSV line, keeping commas inside quotes ("1,500.00", "Deposit, Moi Avenue"). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** A statement amount: "1,500.00" → 1500, "(2,000.00)" or "2,000.00-" → -2000, "KES 50" → 50. */
export function statementAmount(text: string | undefined): number {
  const t = (text || "").trim();
  if (!t) return 0;
  const negative = /^\(.*\)$/.test(t) || /^-/.test(t) || /-$/.test(t) || /DR$/i.test(t);
  const n = parseFloat(t.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

/** One line of a bank or M-Pesa statement the office uploads for reconciliation. */
export interface StatementEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  reference?: string;
  balance?: number;
  matched?: boolean;
  matchedTransactionId?: string;
  confidence?: number;
}

export const parseCSVStatement = (csvContent: string): StatementEntry[] => {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0].toLowerCase());
  const entries: StatementEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = splitCsvLine(lines[i]);

    const dateIdx = headers.findIndex(
      (h) => h.includes("date") || h.includes("time"),
    );
    const descIdx = headers.findIndex(
      (h) =>
        h.includes("desc") ||
        h.includes("particular") ||
        h.includes("narration"),
    );
    const debitIdx = headers.findIndex(
      (h) =>
        h.includes("debit") ||
        h.includes("withdrawal") ||
        h.includes("paid out"),
    );
    const creditIdx = headers.findIndex(
      (h) =>
        h.includes("credit") || h.includes("deposit") || h.includes("paid in"),
    );
    const amountIdx = headers.findIndex(
      (h) => h.includes("amount") && !h.includes("balance"),
    );
    const balanceIdx = headers.findIndex((h) => h.includes("balance"));
    const refIdx = headers.findIndex(
      (h) =>
        h.includes("ref") ||
        h.includes("transaction id") ||
        h.includes("receipt"),
    );

    const debitAmt =
      debitIdx >= 0
        ? statementAmount(values[debitIdx])
        : 0;
    const creditAmt =
      creditIdx >= 0
        ? statementAmount(values[creditIdx])
        : 0;
    const singleAmt =
      amountIdx >= 0
        ? statementAmount(values[amountIdx])
        : 0;

    let amount = 0;
    let type: "credit" | "debit" = "credit";

    if (debitAmt !== 0) {
      amount = Math.abs(debitAmt);
      type = "debit";
    } else if (creditAmt !== 0) {
      amount = Math.abs(creditAmt);
      type = "credit";
    } else if (singleAmt !== 0) {
      amount = Math.abs(singleAmt);
      type = singleAmt < 0 ? "debit" : "credit";
    }

    if (amount > 0) {
      entries.push({
        id: `stmt-${i}`,
        date: values[dateIdx] || localDate(),
        description: values[descIdx] || "Unknown",
        amount,
        type,
        reference: refIdx >= 0 ? values[refIdx] : undefined,
        balance:
          balanceIdx >= 0
            ? statementAmount(values[balanceIdx])
            : undefined,
        matched: false,
      });
    }
  }

  return entries;
};
