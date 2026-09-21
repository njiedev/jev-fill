# Jev Fill

simplify sucks so im making a better version with jev

jev can see copy pasted texted and reason what part to paste and its hella fast so itll be goated for job apps

someone send me $500k pls

Add your TypeSafe API key and résumé once, open an application, and review the values Jev Fill proposes before anything is placed into the form. There is no localhost server and users do not run `npm start`.

## What it does

- Imports PDF, DOCX, and TXT résumés locally
- Lets you edit the parsed source and add contact details, links, work authorization, or reusable answers
- Matches common labeled facts without an API request
- Uses Jev for unfamiliar fields, constrained to existing profile spans and form options
- Groups exact matches, Jev suggestions, and manual-review fields
- Fills only selected values and never submits an application
- Leaves sensitive and voluntary-disclosure questions for manual review

## Install the development build

Requires Node.js 20 or newer.

```sh
npm install
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this project's `dist` folder. Click Jev Fill's toolbar button to open the side panel.

In **Setup**:

1. Paste a TypeSafe API key and choose whether Chrome should remember it on this device.
2. Click **Verify & save**.
3. Choose a PDF, DOCX, or TXT résumé.
4. Review the parsed profile source and save it.

Then open a job application and choose **Review autofill for this page**.

## Privacy model

- A session-only API key is removed when Chrome closes.
- A remembered key is held in Chrome extension storage on the device; that storage is not encrypted.
- The original résumé file is parsed locally and is not uploaded.
- Saved profile text stays in Chrome extension storage.
- Profile text is sent to TypeSafe only when Jev is needed to match unresolved fields after the user starts a scan.
- The API key is handled by the extension background worker and is never sent to job pages.

## Development

```sh
npm run dev
```

Reload the unpacked extension after a rebuild. Run `npm run verify` before shipping changes.

Custom shadow-DOM controls, multipage automation, application tracking, and generated essay answers are not part of the current version.
