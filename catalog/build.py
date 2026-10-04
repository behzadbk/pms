#!/usr/bin/env python3
"""اعتبارسنجی کاتالوگ و ساخت catalog.json.
اجرا:  python3 catalog/build.py          # ساخت
       python3 catalog/build.py --check  # فقط بررسی (برای CI)
"""
import glob, json, os, re, sys
import yaml

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(ROOT)
TYPES = {"boolean", "integer", "number", "money", "percent", "enum", "multi_enum", "string", "list", "fixed"}
STATUSES = {"implemented", "partial", "unverified", "planned"}
TIERS = {"simple", "economic", "professional"}

errors, warns = [], []
def err(m): errors.append(m)
def warn(m): warns.append(m)

meta = yaml.safe_load(open(os.path.join(ROOT, "_meta.yml"), encoding="utf-8"))
domains = set(meta.get("domains", {}).keys()) if isinstance(meta.get("domains"), dict) else {
    (d["id"] if isinstance(d, dict) else d) for d in meta.get("domains", [])}

items, ids = [], {}
for f in sorted(glob.glob(os.path.join(ROOT, "*.yml"))):
    if os.path.basename(f).startswith("_"):
        continue
    doc = yaml.safe_load(open(f, encoding="utf-8"))
    dom = doc.get("domain")
    if domains and dom not in domains:
        err(f"{os.path.basename(f)}: دامنه‌ی ناشناخته {dom}")
    for it in doc.get("items", []):
        it["domain"] = dom
        it["file"] = os.path.basename(f)
        items.append(it)

for it in items:
    i = it.get("id", "?")
    if i in ids: err(f"شناسه‌ی تکراری {i}")
    ids[i] = it
    for k in ("id", "title", "type", "status"):
        if k not in it: err(f"{i}: فیلد {k} ندارد")
    if it.get("type") not in TYPES: err(f"{i}: نوع نامعتبر {it.get('type')}")
    if it.get("status") not in STATUSES: err(f"{i}: وضعیت نامعتبر {it.get('status')}")
    for t in it.get("tiers", []):
        if t not in TIERS: err(f"{i}: سطح نامعتبر {t}")
    if it["type"] in ("enum", "multi_enum") and not it.get("values"): err(f"{i}: values ندارد")
    if "min" in it and "max" in it and it["min"] > it["max"]: err(f"{i}: min>max")
    d = it.get("default")
    if d is not None and it["type"] in ("integer", "number", "money") and not isinstance(d, (int, float)):
        err(f"{i}: default عددی نیست")
    if it["type"] == "enum" and d is not None and d not in it.get("values", []):
        err(f"{i}: default خارج از values")
    if it["type"] in ("integer", "number", "money") and isinstance(d, (int, float)):
        if "min" in it and d < it["min"] or "max" in it and d > it["max"]:
            err(f"{i}: default خارج از بازه")
    for pat in it.get("detect", []):
        try: re.compile(pat)
        except re.error as e: err(f"{i}: regex خراب {pat}: {e}")
    eng = it.get("engine")
    if it["status"] in ("implemented", "partial") and not eng:
        err(f"{i}: وضعیت {it['status']} ولی engine ندارد")
    if it["status"] == "partial" and not it.get("note"):
        err(f"{i}: partial بدون note توضیح محدودیت")
    if eng and not eng.startswith("sql:") and "/" in eng:
        if not os.path.exists(os.path.join(REPO, eng)):
            err(f"{i}: مسیر engine وجود ندارد: {eng}")

for it in items:
    for n in it.get("needs", []):
        if n not in ids: err(f"{it['id']}: needs ناشناخته {n}")

# ---- سازگاری با کد ----
def code_list(path, name):
    p = os.path.join(REPO, path)
    if not os.path.exists(p): return None
    s = open(p, encoding="utf-8").read()
    m = re.search(name + r"[^=]*=\s*\[(.*?)\]", s, re.S)
    return re.findall(r"'([\w.:-]+)'|\"([\w.:-]+)\"", m.group(1)) if m else None

tiers_ts = None
for cand in glob.glob(os.path.join(REPO, "**/tiers.ts"), recursive=True):
    if "node_modules" in cand: continue
    tiers_ts = open(cand, encoding="utf-8").read(); break
if tiers_ts:
    keys = set(re.findall(r"'([a-z_]+)'", tiers_ts))
    cat_keys = {i.split(".", 1)[1] for i in ids if i.startswith("feature.")}
    for k in sorted(cat_keys - keys): err(f"feature.{k} در tiers.ts نیست")
    for k in sorted(re.findall(r"\b(?:BASE|AMENITY|FULL)\w*\s*[:=][^\[]*\[(.*?)\]", tiers_ts, re.S) and
                    {x for blk in re.findall(r"\b(?:BASE|AMENITY|FULL)\w*\s*[:=][^\[]*\[(.*?)\]", tiers_ts, re.S)
                     for x in re.findall(r"'([a-z_]+)'", blk)} - cat_keys):
        err(f"قابلیت {k} در tiers.ts هست ولی در کاتالوگ نیست")
else:
    warn("tiers.ts پیدا نشد؛ بررسی سطح‌ها انجام نشد")

out = {"meta": meta, "items": items, "count": len(items)}
if "--check" not in sys.argv:
    json.dump(out, open(os.path.join(ROOT, "catalog.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

by = {}
for it in items: by[it["status"]] = by.get(it["status"], 0) + 1
print(f"آیتم‌ها: {len(items)}  وضعیت‌ها: {by}")
for w in warns: print("هشدار:", w)
for e in errors: print("خطا:", e)
sys.exit(1 if errors else 0)
