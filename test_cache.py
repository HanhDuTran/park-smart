"""Verification script for ParkSmart's Overpass in-memory cache.

NOT part of the app — run manually with `python test_cache.py` from C:\\parkAI
to confirm the 5-minute cache is actually working (cache hits are fast,
cold/expired entries trigger a real Overpass request).
"""

import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.services import overpass  # noqa: E402

LAT, LNG, RADIUS = 37.7749, -122.4194, 1000


async def main() -> None:
    results = []
    overpass._cache.clear()

    # --- Test 1: cold call vs cache-hit timing ---
    t0 = time.time()
    real1, est1 = await overpass.fetch_parking(LAT, LNG, RADIUS)
    dt1 = time.time() - t0
    print(f"Call 1 (cold, real Overpass request): {dt1 * 1000:.1f}ms, "
          f"{len(real1)} real + {len(est1)} estimated spots")

    t0 = time.time()
    real2, est2 = await overpass.fetch_parking(LAT, LNG, RADIUS)
    dt2 = time.time() - t0
    print(f"Call 2 (should be a cache hit): {dt2 * 1000:.1f}ms, "
          f"{len(real2)} real + {len(est2)} estimated spots")

    test1_pass = dt2 < 0.05 and dt1 > 0.5
    results.append(("Cache hit <50ms AND cold call >500ms", test1_pass))
    if dt2 >= 0.05:
        print(f"  -> cache hit took {dt2 * 1000:.1f}ms (expected <50ms)")
    if dt1 <= 0.5:
        print(f"  -> cold call took {dt1 * 1000:.1f}ms (expected >500ms)")

    # --- Test 2: manually expire the cache entry, confirm a real re-fetch ---
    key = overpass._cache_key(LAT, LNG, RADIUS)
    _, real, est = overpass._cache[key]
    overpass._cache[key] = (time.monotonic() - 400, real, est)  # past the 300s TTL

    t0 = time.time()
    real3, est3 = await overpass.fetch_parking(LAT, LNG, RADIUS)
    dt3 = time.time() - t0
    print(f"Call 3 (after manually expiring the cache entry): {dt3 * 1000:.1f}ms, "
          f"{len(real3)} real + {len(est3)} estimated spots")

    test2_pass = dt3 > 0.5 and (len(real3) + len(est3)) > 0
    results.append(("Expired entry triggers a real re-fetch (>500ms, real data returned)", test2_pass))

    print("\n=== RESULTS ===")
    all_pass = True
    for name, passed in results:
        print(f"[{'PASS' if passed else 'FAIL'}] {name}")
        all_pass = all_pass and passed

    print("\n" + ("ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED"))
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    asyncio.run(main())
