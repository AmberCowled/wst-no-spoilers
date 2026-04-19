# WST No-Spoilers

Official-style community browser extension for reducing accidental **scores**, **results**, and **winner/loser** cues while browsing [World Snooker Tour](https://www.wst.tv/) (`wst.tv`) pages.

This repository contains the extension source (Manifest V3). Spoiler masking is implemented with **blur** overlays on matched elements so layout stays stable.

## Install (development build)

1. Clone this repository.
2. Open **Chrome** or **Microsoft Edge** → `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `extension` folder inside this repo.

Extension icons are PNGs under `extension/icons/`; filenames and sizes must stay aligned with `extension/manifest.json`.

## Usage

- Use the toolbar icon to turn **spoiler protection** on or off. The setting is synced with your browser profile when you are signed in (via `chrome.storage.sync`).
- When protection is **on**, the extension applies blur masks to elements matched by the `MASK_RULES` array in `extension/content/content.js`. Each rule targets specific score or result elements using one of three modes: full-element blur, digit-only blur, or character-level blur. If the site’s markup changes and masking breaks, open an issue or submit a PR to adjust the selectors in `MASK_RULES`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch workflow, selector updates, and review expectations.

## License

Released under the [MIT License](LICENSE).

The project name “WST No-Spoilers” refers to World Snooker Tour fan and community use; ensure compliance with WST branding and trademark policies when publishing derivative work or store listings.
