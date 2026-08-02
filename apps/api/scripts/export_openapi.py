"""Write the OpenAPI schema to a file.

CI regenerates the TypeScript client from this and fails if the result differs
from what is committed, which is what keeps the two-language stack honest
(PLAN.md section 19).
"""

import json
import sys
from pathlib import Path

from app.main import app


def main() -> int:
    destination = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("openapi.json")
    destination.parent.mkdir(parents=True, exist_ok=True)

    schema = app.openapi()
    # sort_keys so the output is stable and diffable across runs.
    destination.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {destination} ({len(schema['paths'])} paths)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
