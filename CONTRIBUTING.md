# Contributing

Thanks for helping improve WST No-Spoilers.

## Workflow

1. Fork the repository and create a branch from `main`.
2. Make focused changes (one concern per PR when possible).
3. Describe **what** you changed and **why** in the PR. If you adjusted selectors for `wst.tv`, include a short note on which page or component you tested (URL path or screenshot if helpful).

## Working on masking rules

- Primary logic lives in `extension/content/content.js` (`MATCHES_SCORE_MASK_SELECTOR`, `DRAW_SCORE_MASK_SELECTOR`) and `extension/content/content.css`.
- The masks target specific `wst.tv` markup; if the site’s classes change, update those constants and note what you tested.
- Test with spoiler protection **on** and **off** using the extension popup.
- If blur hides too much UI, narrow the selector or scope it with a more specific parent selector before adding new rules.

## Extension hygiene

- Reload the unpacked extension after manifest or background changes.
- For content scripts and CSS, a normal refresh of the tab is usually enough.

## Code of conduct

Be respectful in issues and pull requests. Assume good intent; disagree on technical merits clearly and briefly.
