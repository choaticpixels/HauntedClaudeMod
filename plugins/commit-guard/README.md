# 🛡️ Commit Guard

*Claude should never be able to publish your secrets.*

When Claude runs `git commit` or `git push`, Commit Guard checks the change first and **blocks it** if it contains something you'd regret sharing. Claude is told exactly what was found and how to fix it, so it can self-correct without you.

## What it catches

| Kind | Examples |
| --- | --- |
| **Secrets in code** | AWS, GitHub, Anthropic, OpenAI, Stripe, Slack, Google keys · private key blocks · JWTs · DB URLs with passwords · hardcoded `api_key = "…"` |
| **Crypto** | Wallet private keys (hex and base58), seed phrases, keypair/wallet JSON files |
| **Files that should never be committed** | `.env*` (not `.env.example`), `*.pem`/`*.key`, `id_rsa`, `credentials.json`, `.npmrc`, `node_modules/`, `.venv/` |
| **Size** | Warns over 5 MB, blocks over 95 MB (GitHub rejects 100 MB) |

It understands `git add -A && git commit`, `commit -am`, `git -C dir …`, and scans **unpushed commits** on `git push`. Placeholders (`your_api_key`, `process.env.X`, `example`) are ignored.

## Install

```
/plugin marketplace add choaticpixels/HauntedClaudeMod
/plugin install commit-guard@claude-mods
```

## Commands

- `/commit-guard`: status and the last check
- `/commit-guard scan`: scan your working tree and unpushed commits right now
- `/commit-guard allow-once`: let the next blocked commit through (false positive)
- `/commit-guard off` · `on`

## Quieting false positives

- Add path fragments to a `.commitguardignore` file in the repo (one per line, `#` for comments).
- Put `commit-guard:ignore` in a comment on the offending line.

## Notes

Commit Guard is a safety net, not a guarantee: it only sees commits and pushes that Claude runs through Bash, and it looks for known patterns. Rotate any key that has ever been exposed.
