// Line audit W5: the bank statement upload split each line on every comma. Banks put
// "1,500.00" in quotes and descriptions carry commas, so amounts were read as 1 and
// columns shifted. Accounting brackets "(2,000.00)" mean money out.
const { parseCSVStatement } = require("./web/statement");
let pass = 0; const fails = [];
const check = (name, ok, detail) => ok ? pass++ : fails.push(`[statement] ${name}: ${detail}`);

const csv = [
  'Date,Description,Debit,Credit,Balance',
  '2026-11-02,"Cash deposit, Moi Avenue branch",,"1,500.00","101,500.00"',
  '2026-11-03,Transfer to M-Pesa,"25,000.00",,"76,500.00"',
].join("\r\n");
const e = parseCSVStatement(csv);
check("two lines read", e.length === 2, `got ${e.length} entries`);
check("quoted thousands", e[0] && e[0].amount === 1500 && e[0].type === "credit", JSON.stringify(e[0]));
check("description with a comma kept whole", e[0] && e[0].description === "Cash deposit, Moi Avenue branch", JSON.stringify(e[0] && e[0].description));
check("balance", e[0] && e[0].balance === 101500, JSON.stringify(e[0] && e[0].balance));
check("debit", e[1] && e[1].amount === 25000 && e[1].type === "debit", JSON.stringify(e[1]));

const single = parseCSVStatement('Date,Narration,Amount\n2026-11-04,Rent,"(2,000.00)"\n2026-11-05,Sale,"3,250.50"');
check("bracketed amount is money out", single[0] && single[0].amount === 2000 && single[0].type === "debit", JSON.stringify(single[0]));
check("single amount column", single[1] && single[1].amount === 3250.5 && single[1].type === "credit", JSON.stringify(single[1]));

console.log(`${pass} passed, ${fails.length} failed` + (fails.length ? "\n\nFAILURES:\n" + fails.join("\n") : ""));
if (fails.length) process.exitCode = 1;
