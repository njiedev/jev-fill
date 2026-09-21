# Jev Fill

simplify sucks so im making a better version with jev
jev can see copy pasted textted and reason what part to paste and its hella fast so itll be goated for job apps
sound send me $500k pls

## Current scope

- Standard text inputs, textareas, selects, radio groups, and visible form fields
- Exact matching for common labeled profile values
- Jev matching for unfamiliar fields
- Local-only profile storage through Chrome extension storage
- Manual preview before every fill
- No automatic submission
- Sensitive and voluntary-disclosure questions always left for manual review

File uploads, custom shadow-DOM controls, multipage automation, application tracking, and generated essay answers are intentionally deferred.

## Setup

Requires Node.js 20 or newer.

```sh
npm install
cp .env.example .env
```

Add `TYPESAFE_API_KEY` to `.env`. Do not put the key in the extension or commit it.

Build and verify:

```sh
npm run verify
```

Start the local matcher:

```sh
set -a
source .env
set +a
npm start
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the absolute `dist` folder in this project. Pin Jev Fill, open a job application, and click its toolbar button.

Without a TypeSafe key, the server still runs in exact-match mode so the deterministic path can be tested.

## Development

```sh
npm run dev
```

Reload the unpacked extension after its build changes. Profile text stays on the device. A matching request is sent only to the localhost service after **Scan this form** is clicked; the localhost service sends the pasted profile to TypeSafe only when Jev matching is needed.
