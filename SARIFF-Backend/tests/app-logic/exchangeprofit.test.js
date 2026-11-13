// Reports page: exchange profit for a period, from trades exactly as the server
// sends them (ExchangeResponseDto has "date", not "transactionDate"/"createdAt").
const { exchangeProfitBetween } = require("./web/exchangeProfit");
let failed = 0;
const eq = (name, got, want) => {
  if (got === want) console.log("ok   " + name);
  else { failed++; console.log(`FAIL ${name}: got ${got}, want ${want}`); }
};

const now = new Date();
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 10).toISOString();
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 10).toISOString();

const trades = [
  { code: "EX-1", date: thisMonth, profit: 500, status: "Completed" },
  { code: "EX-2", date: thisMonth, profit: 0, status: "Completed" },        // a purchase books none
  { code: "EX-3", date: thisMonth, profit: 300, status: "Voided" },         // voided: its profit was removed
  { code: "EX-4", date: lastMonth, profit: 900, status: "Completed" },      // another month
];

eq("this month's exchange profit counts this month's completed sales", exchangeProfitBetween(trades, monthStart), 500);
const dayStart = new Date(now.getFullYear(), now.getMonth(), 1);
const nextDay = new Date(now.getFullYear(), now.getMonth(), 2);
eq("one day's profit (7-day trend) counts that day's trades", exchangeProfitBetween(trades, dayStart, nextDay), 500);

if (failed) { console.log(`${failed} failed`); process.exit(1); }
