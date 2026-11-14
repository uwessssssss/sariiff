#!/usr/bin/env python3
"""Turn scanner outputs into a short readable summary in the job log.
   summarize.py sarif <file.sarif>...      (CodeQL)
   summarize.py zap <report.json> <label>  (OWASP ZAP)
   summarize.py gitleaks <report.json>
   summarize.py cobertura <coverage.xml>
Exit 1 when there is something that must be fixed (see each mode)."""
import json, sys, collections, xml.etree.ElementTree as ET

mode, args = sys.argv[1], sys.argv[2:]
if mode == "sarif":
    import os
    total, worst, blocking = 0, 0, 0
    rp = os.path.join(os.path.dirname(__file__), "codeql-reviewed.json")
    reviewed = json.load(open(rp)) if os.path.exists(rp) else {}
    for f in args:
        d = json.load(open(f))
        for run in d.get("runs", []):
            # CodeQL keeps its rules (with their security-severity) in tool.extensions, not the driver
            tool = run.get("tool", {})
            comps = [tool.get("driver", {})] + tool.get("extensions", [])
            rules = {r["id"]: r for c in comps for r in c.get("rules", [])}
            for res in run.get("results", []):
                rid = res.get("ruleId"); r = rules.get(rid, {})
                sev = float(r.get("properties", {}).get("security-severity", 0) or 0)
                lvl = res.get("level", r.get("defaultConfiguration", {}).get("level", "warning"))
                loc = res.get("locations", [{}])[0].get("physicalLocation", {})
                path = loc.get("artifactLocation", {}).get("uri", "?"); line = loc.get("region", {}).get("startLine", "?")
                total += 1
                note = ""
                if path.startswith("SARIFF-Backend/tests/"): note = " (test script)"
                elif rid in reviewed: note = " (reviewed)"
                elif sev >= 7.0 or lvl in ("error", "warning"): blocking += 1; note = " (BLOCKING)"
                if sev: worst = max(worst, sev)
                print(f"  [{lvl}{f' sev {sev}' if sev else ''}] {rid}: {path}:{line}{note} — {res.get('message', {}).get('text', '')[:160]}")
    used = sorted({r for r in reviewed})
    if used:
        print("\nREVIEWED (not blocking):")
        for r in used: print(f"  {r}: {reviewed[r]}")
    print(f"\nCODEQL: {total} finding(s); highest security severity {worst}; blocking (any warning/error, or severity 7+, not reviewed, outside tests) {blocking}")
    sys.exit(1 if blocking else 0)
if mode == "zap":
    import os
    d = json.load(open(args[0])); label = args[1] if len(args) > 1 else ""
    rp = os.path.join(os.path.dirname(__file__), "zap-reviewed.json")
    reviewed = json.load(open(rp)) if os.path.exists(rp) else {}
    counts = collections.Counter(); blocking = 0; used = set()
    for site in d.get("site", []):
        for a in site.get("alerts", []):
            risk = a.get("riskdesc", "?").split(" ")[0]; counts[risk] += 1
            name = a.get("name", ""); note = ""
            if name in reviewed: note = " (reviewed)"; used.add(name)
            elif risk in ("High", "Medium"): note = " (BLOCKING)"; blocking += 1
            print(f"  [{a.get('riskdesc')}] {name}{note} — {len(a.get('instances', []))} place(s); e.g. {(a.get('instances') or [{}])[0].get('uri', '')[:110]}")
    for n in sorted(used): print(f"  reviewed: {n}: {reviewed[n]}")
    print(f"\nZAP {label}: " + (", ".join(f"{k} {v}" for k, v in sorted(counts.items())) or "no alerts") + f"; blocking (High/Medium, not reviewed) {blocking}")
    sys.exit(1 if blocking else 0)
if mode == "gitleaks":
    try: d = json.load(open(args[0]))
    except Exception: d = []
    for x in d:
        print(f"  {x.get('RuleID')}: {x.get('File')}:{x.get('StartLine')} commit {x.get('Commit','')[:8]} {x.get('Date','')[:10]} — {x.get('Match','')[:40]}…")
    print(f"\nSECRETS IN GIT HISTORY: {len(d)} finding(s)")
    sys.exit(1 if d else 0)
if mode == "cobertura":
    # summarize.py cobertura <coverage.xml> [title]
    # Totals for our own code (SARIFF.* only), per project, and per money-critical file.
    import re
    r = ET.parse(args[0]).getroot()
    title = args[1] if len(args) > 1 else "COVERAGE"
    files = {}   # path -> {line: hit}
    branches = {}  # path -> {line: (covered, total)}
    for pkg in r.iter("package"):
        name = pkg.get("name") or ""
        for cls in pkg.iter("class"):
            fn = (cls.get("filename") or "").replace("\\", "/")
            if "SARIFF" not in fn and not name.startswith("SARIFF"): continue
            if "/Migrations/" in fn or fn.endswith(".Designer.cs") or "/obj/" in fn: continue
            d = files.setdefault(fn, {}); b = branches.setdefault(fn, {})
            for ln in cls.iter("line"):
                n = int(ln.get("number")); hit = int(ln.get("hits", "0")) > 0
                d[n] = d.get(n, False) or hit
                cc = ln.get("condition-coverage")
                if cc:
                    m = re.search(r"\((\d+)/(\d+)\)", cc)
                    if m:
                        c, t = int(m.group(1)), int(m.group(2))
                        pc, pt = b.get(n, (0, 0)); b[n] = (max(pc, c), max(pt, t))
    def pct(c, t): return (100.0 * c / t) if t else 0.0
    def short(fn):
        i = fn.find("SARIFF.")
        return fn[i:] if i >= 0 else fn
    tot_c = sum(sum(v.values()) for v in files.values()); tot_t = sum(len(v) for v in files.values())
    bc = sum(c for v in branches.values() for c, t in v.values()); bt = sum(t for v in branches.values() for c, t in v.values())
    print(f"\n{title}: lines {pct(tot_c, tot_t):.1f}% ({tot_c}/{tot_t}), branches {pct(bc, bt):.1f}% ({bc}/{bt}) — our code only")
    proj = {}
    for fn, v in files.items():
        m = re.search(r"(SARIFF\.(?:API|Core|Infrastructure))", fn); k = m.group(1) if m else "other"
        c, t = proj.get(k, (0, 0)); proj[k] = (c + sum(v.values()), t + len(v))
    for k, (c, t) in sorted(proj.items()): print(f"  {k}: {pct(c, t):.1f}% ({c}/{t})")
    money = re.compile(r"Services/(Transactions/(?!InvoiceService)|Exchange/|Clients/StatementHelper|Common/ValidationHelper|Reports/CurrencyRollup|Accounts/)")
    rows = sorted(((short(fn), sum(v.values()), len(v)) for fn, v in files.items() if money.search(fn)), key=lambda x: x[0])
    if rows:
        mc = sum(r[1] for r in rows); mt = sum(r[2] for r in rows)
        print(f"\n  MONEY CODE: {pct(mc, mt):.1f}% ({mc}/{mt} lines)")
        for f, c, t in rows: print(f"    {pct(c, t):5.1f}%  {c:4}/{t:<4} {f}")
    sys.exit(0)
