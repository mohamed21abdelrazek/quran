#!/usr/bin/env python3
"""تنزيل صور مصحف المدينة (مجمع الملك فهد) — ٦٠٤ صفحات، ١٠ تنزيلات متوازية."""
import concurrent.futures as cf
import os
import sys
import time
import urllib.request

BASE = "https://files.quran.app/hafs/madani/width_1260/page{:03d}.png"
DIR = os.path.join(os.path.dirname(__file__), "..", "public", "mushaf", "madani")
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def fetch(n: int) -> bool:
    out = os.path.join(DIR, f"page{n:03d}.png")
    if os.path.exists(out) and os.path.getsize(out) > 1000:
        with open(out, "rb") as f:
            if f.read(8) == PNG_MAGIC:
                return True
    for attempt in range(5):
        try:
            req = urllib.request.Request(BASE.format(n), headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            if data[:8] == PNG_MAGIC and len(data) > 1000:
                with open(out, "wb") as f:
                    f.write(data)
                return True
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    print(f"فشل: صفحة {n}", file=sys.stderr)
    return False


def main() -> int:
    os.makedirs(DIR, exist_ok=True)
    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(fetch, range(1, 605)))
    ok = sum(results)
    print(f"اكتمل: {ok}/604 صفحة في {time.time()-t0:.0f} ثانية")
    if ok != 604:
        return 1
    total = sum(os.path.getsize(os.path.join(DIR, f)) for f in os.listdir(DIR))
    print(f"الحجم الكلي: {total/1024/1024:.1f}MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
