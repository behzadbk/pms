#!/usr/bin/env python3
"""catalog.json را داخل template.html می‌گذارد و index.html می‌سازد (فایل مستقل و قابل انتشار)."""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(here, "..", "catalog.json"), encoding="utf-8"))
js = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
tpl = open(os.path.join(here, "template.html"), encoding="utf-8").read()
open(os.path.join(here, "index.html"), "w", encoding="utf-8").write(tpl.replace("__CATALOG__", js))
print("index.html ساخته شد", len(js) // 1024, "KB")
