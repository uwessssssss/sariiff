// Tiny helper for the Android test: GET /otp?phone=+256...&after=<bytes> returns the newest
// SMS code the API printed to its log (Development prints instead of sending).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
const LOG = process.argv[2], PORT = Number(process.argv[3] || 18099);
createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const text = readFileSync(LOG, "utf8");
  if (u.pathname === "/mark") return res.end(JSON.stringify({ mark: text.length }));
  const phone = (u.searchParams.get("phone") || "").replace(/[+]/g, "\\+");
  const re = new RegExp(`Message to "?${phone}"?: "?Sarif: Your verification code is (\\d{6})`, "g");
  const all = [...text.slice(Number(u.searchParams.get("after") || 0)).matchAll(re)];
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ otp: all.length ? all[all.length - 1][1] : null }));
}).listen(PORT, "127.0.0.1", () => console.log(`otp helper on ${PORT}`));
