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
                elif sev >= 7.0: blocking += 1
                if sev: worst = max(worst, sev)
                print(f"  [{lvl}{f' sev {sev}' if sev else ''}] {rid}: {path}:{line}{note} — {res.get('message', {}).get('text', '')[:160]}")
    used = sorted({r for r in reviewed})
    if used:
        print("\nREVIEWED (not blocking):")
        for r in used: print(f"  {r}: {reviewed[r]}")
    print(f"\nCODEQL: {total} finding(s); highest security severity {worst}; blocking (severity 7+, not reviewed, outside tests) {blocking}")
    sys.exit(1 if blocking else 0)
if mode == "zap":
    d = json.load(open(args[0])); label = args[1] if len(args) > 1 else ""
    counts = collections.Counter()
    for site in d.get("site", []):
        for a in site.get("alerts", []):
            risk = a.get("riskdesc", "?").split(" ")[0]; counts[risk] += 1
            print(f"  [{a.get('riskdesc')}] {a.get('name')} — {len(a.get('instances', []))} place(s); e.g. {(a.get('instances') or [{}])[0].get('uri', '')[:110]}")
    print(f"\nZAP {label}: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())) or "no alerts")
    sys.exit(1 if counts.get("High", 0) else 0)
if mode == "gitleaks":
    try: d = json.load(open(args[0]))
    except Exception: d = []
    for x in d:
        print(f"  {x.get('RuleID')}: {x.get('File')}:{x.get('StartLine')} commit {x.get('Commit','')[:8]} {x.get('Date','')[:10]} — {x.get('Match','')[:40]}…")
    print(f"\nSECRETS IN GIT HISTORY: {len(d)} finding(s)")
    sys.exit(1 if d else 0)
if mode == "cobertura":
    r = ET.parse(args[0]).getroot()
    print(f"\nCOVERAGE: lines {float(r.get('line-rate', 0))*100:.1f}%, branches {float(r.get('branch-rate', 0))*100:.1f}%")
    for p in r.iter("package"):
        print(f"  {p.get('name')}: lines {float(p.get('line-rate', 0))*100:.1f}%")
    sys.exit(0)
