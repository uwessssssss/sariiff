// Line audit M12: the phone app read typed amounts with parseFloat, which stops at the first
// character it does not understand: "1,500" became 1 and was recorded as 1 shilling.
const { parseAmount, anyBadAmount } = require("./mob/utils/amount");
let pass = 0; const fails = [];
const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || a === b;
const cases = [
  ["1,500", 1500], ["12,345,678.50", 12345678.5], [" 2 500.75 ", 2500.75], ["1500", 1500], ["0.5", 0.5], [".5", 0.5],
  ["1,50", NaN], ["1,5000", NaN], ["15o0", NaN], ["12abc", NaN], ["1.2.3", NaN], ["", NaN], ["  ", NaN], ["-", NaN],
];
for (const [text, want] of cases) {
  const got = parseAmount(text);
  same(got, want) ? pass++ : fails.push(`[amount] parseAmount(${JSON.stringify(text)}) = ${got}, expected ${want}`);
}
const bad = [[["", "1,500"], false], [["12abc"], true], [[" ", undefined], false]];
for (const [args, want] of bad) {
  const got = anyBadAmount(...args);
  got === want ? pass++ : fails.push(`[amount] anyBadAmount(${JSON.stringify(args)}) = ${got}, expected ${want}`);
}
console.log(`${pass} passed, ${fails.length} failed` + (fails.length ? "\n\nFAILURES:\n" + fails.join("\n") : ""));
if (fails.length) process.exitCode = 1;
