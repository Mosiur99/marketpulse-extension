# MarketPulse

A Chrome extension (Manifest V3) that collects financial market news from free public RSS feeds, sorts it into 11 categories, ranks headlines by importance with keyword rules, and sends desktop notifications for important stories.

No server, no paid APIs, no build step: plain JavaScript modules.

> Work in progress. The extension is built in small, tested steps.

## Install locally

1. Clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the repository folder (the one with `manifest.json`).

## Tests

```bash
npm install
npm test            # unit tests (node:test)
npm run test:e2e    # loads the unpacked extension in Chromium with Playwright
```

## Project layout

```
manifest.json
src/
  background.js      service worker
  config/            feeds, categories, keywords, settings
  core/              pure logic (no chrome.* calls)
  services/          thin wrappers around chrome.* APIs
  ui/                popup, dashboard and options pages
test/
  unit/              node:test
  e2e/               Playwright
```

## License

MIT
