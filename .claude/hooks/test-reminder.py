#!/usr/bin/env python3
"""PostToolUse hook: after Edit/Write on src/lib/<name>.ts, remind (non-blocking)
when the colocated <name>.test.ts is missing. Enforces the Testing Policy in
AGENTS.md at authoring time; the coverage ratchet enforces it in CI."""
import json
import os
import sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

path = (data.get("tool_input") or {}).get("file_path") or ""
normalized = path.replace(os.sep, "/")

if (
    "/src/lib/" in normalized
    and normalized.endswith(".ts")
    and not normalized.endswith(".test.ts")
    and not normalized.endswith(".d.ts")
):
    test_path = path[:-3] + ".test.ts"
    if not os.path.exists(test_path):
        name = os.path.basename(path)
        test_name = os.path.basename(test_path)
        message = (
            f"Testing policy (AGENTS.md): {name} has no colocated {test_name}. "
            "Create or extend the unit spec in this same change."
        )
        print(
            json.dumps(
                {
                    "systemMessage": message,
                    "hookSpecificOutput": {
                        "hookEventName": "PostToolUse",
                        "additionalContext": message,
                    },
                }
            )
        )

sys.exit(0)
