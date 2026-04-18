#!/usr/bin/env python3
import sys, json, re

d = json.load(sys.stdin)
cmd = d.get('tool_input', {}).get('command', '')
allowed = {'main', 'neon-preview-test'}

for pat in [
    r'git\s+checkout\s+.*-b\s+(\S+)',
    r'git\s+switch\s+.*-c\s+(\S+)',
    r'git\s+branch\s+([^-]\S*)',
]:
    m = re.search(pat, cmd)
    if m and m.group(1) not in allowed:
        print(json.dumps({
            'hookSpecificOutput': {
                'hookEventName': 'PreToolUse',
                'permissionDecision': 'deny',
                'permissionDecisionReason': f'Branch "{m.group(1)}" not allowed. Only main and neon-preview-test are permitted.',
            }
        }))
        break
