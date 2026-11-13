import { localDate } from "./dates";

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

  const headers = lines[0]
    .toLowerCase()
    .split(",")
    .map((h) => h.trim().replace(/"/g, ""));
  const entries: StatementEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""));

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
        ? parseFloat(values[debitIdx]?.replace(/[^0-9.-]/g, "") || "0")
        : 0;
    const creditAmt =
      creditIdx >= 0
        ? parseFloat(values[creditIdx]?.replace(/[^0-9.-]/g, "") || "0")
        : 0;
    const singleAmt =
      amountIdx >= 0
        ? parseFloat(values[amountIdx]?.replace(/[^0-9.-]/g, "") || "0")
        : 0;

    let amount = 0;
    let type: "credit" | "debit" = "credit";

    if (debitAmt > 0) {
      amount = debitAmt;
      type = "debit";
    } else if (creditAmt > 0) {
      amount = creditAmt;
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
            ? parseFloat(values[balanceIdx]?.replace(/[^0-9.-]/g, "") || "0")
            : undefined,
        matched: false,
      });
    }
  }

  return entries;
};
