# 👻 Haunted Repo: Quick Start

Get haunted in about 2 minutes.

![Haunted Repo demo](docs/demo.svg)

## 1. Install (30 seconds)

In Claude Code (the terminal or the desktop app's Code tab), run:

```
/plugin marketplace add choaticpixels/HauntedClaudeMod
/plugin install haunted-repo@claude-mods
```

If the new commands don't show up, restart Claude Code.

## 2. See it right away (no files touched)

```
/haunt-demo
```

Three demo ghosts rise from files that never existed:

- 👻 **legacy_auth.js**, full of terrible secrets
- 👥 **LEGION**, the ghost of a deleted `node_modules`
- ∿ **wisp of utils.ts**, code cut out during an edit

Watch the **band above your prompt**: the ghosts drift back and forth and whisper lines of their code every ~18 seconds. The `/graveyard` pane opens beside you with their tombstones.

## 3. Talk to the dead

```
/seance legacy_auth.js what is your darkest secret?
```

The ghost answers in character, quoting its own code.

## 4. Do it for real

Ask Claude:

```
create a file called cursed.js with a few functions and some TODO comments
```

then:

```
delete cursed.js
```

Its ghost rises, carrying the code it was deleted with. To set it free, bring the file back:

```
restore cursed.js
```

✨ *It is at peace.*

## 5. Clean up

```
/exorcise all
```

Careful: about 1 ghost in 6 **refuses to leave** and binds itself to your repo ⛓. Only restoring its file frees it.

## Cheat sheet

| Type this | What happens |
| --- | --- |
| `/haunt-demo` | Summon three demo ghosts |
| `/graveyard` | Tombstones of everything you've deleted |
| `/seance [ghost] [question]` | Speak with the dead |
| `/exorcise [name\|all]` | Banish ghosts (most of them) |
| `boo` | Find out |
| `who you gonna call` | 🚫👻 for 60 seconds |
| `trick or treat` | 50/50 |

There are more secrets hidden in it. The [README](plugins/haunted-repo/README.md) has hints, and spoilers if you give up.

## Troubleshooting

- **No band above the prompt?** It only shows while ghosts exist. Run `/haunt-demo`.
- **Commands missing?** Run `/plugin` and check that `haunted-repo` is enabled, then restart Claude Code.
- **Ghosts from yesterday?** That's a feature. They follow you between sessions. `/exorcise all`.
- **Want to try it without installing?** Clone this repo and run `claude --plugin-dir plugins/haunted-repo`.
