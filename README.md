# crash-game

## Commit flow

This repo uses a guided commit flow based on `Commitizen` and `Husky`.

### Install

```sh
npm install
```

### Local commit command

Use the official wrapper instead of `git commit`:

```sh
npm run commit
```

That command runs the root validation chain first, stages the working tree, and then opens the Commitizen prompt.

### Commit format

The prompt enforces:

```text
type(scope): subject
```

Examples:

```text
feat(games): add user authentication
fix(wallets): handle invalid payload
chore: update dependencies
```

### Types

- `feat`
- `fix`
- `docs`
- `chore`
- `docker`

### Scopes

- `games`
- `wallets`
- `frontend`
- `contracts`
- `none`

### Notes

- `git commit` directly is rejected by the hooks.
- Merge, squash, and template commits are left alone.
- The subject must be imperative, without a trailing period.
- The full header length is validated before the prompt accepts the message.
- Body lines are wrapped to 100 characters.
