# 🔁 Stuck Detector

*Stops Claude from running the same failing command forever.*

Retry loops quietly burn tokens and time. Stuck Detector watches tool calls and reacts in three steps:

| Trigger | Reaction |
| --- | --- |
| Same call fails **3×** | 🔁 toast and a status-line warning |
| Same call fails **5×**, or the same error shows up **4×** from different commands | Claude is **nudged**: "stop, diagnose, try something different" |
| Same call fails **8×** | 🛑 the call is **blocked** until you send a new prompt |

It also flags a call repeated 6× even when it succeeds (spinning) and 6+ edits to one file in a short span (churn). A new prompt from you resets everything, and subagents are tracked separately.

## Install

```
/plugin marketplace add choaticpixels/HauntedClaudeMod
/plugin install stuck-detector@claude-mods
```

## Commands

- `/stuck`: status and recent calls
- `/stuck reset` · `off` · `on`
