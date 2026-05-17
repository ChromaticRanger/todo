# Privacy Policy

_Last updated: 17 May 2026_

This policy explains what data **Stash Squirrel** collects, why, and what you can do about it. It covers both the Stash Squirrel web application at https://stash-squirrel.com and the Stash Squirrel browser extension.

Stash Squirrel is operated by **Martin Stickley** ("we", "us"), contactable at:

> Martin Stickley
> [UK Postbox street address — fill in once UK Postbox account is active]
> Email: mds1966@gmail.com _(or a dedicated support@stash-squirrel.com address — recommended)_

If you live in the UK or EEA, we are the **data controller** for the personal data described below.

## What we collect

We only collect what we need to run the service.

**Account data (required to use the service)**
- Email address
- Password (stored only as a salted hash — we never see your plaintext password)
- The time you created your account and signed in

**Content you create**
- Lists, categories, and todos / bookmarks you save, including any titles, URLs, notes, due dates, and priorities you choose to add
- This data is stored against your account so we can show it back to you

**Browser extension data**
- A bearer token issued when you connect the extension, stored locally in your browser via `chrome.storage`. This token is how the extension proves it's you when it calls our API
- The **URL and title of a page you choose to save** — sent to our server only when you click the extension's save button. The extension does not read, monitor, or transmit the pages you browse at any other time
- The extension does not contain analytics, advertising, or tracking code

**Technical data**
- Standard server logs (IP address, request path, timestamp, user-agent) kept for a short period for security and debugging. We do not use these for tracking or profiling.

## What we do _not_ collect

- We do not sell, rent, or share your personal data with advertisers or data brokers
- We do not run third-party analytics, advertising, or session-replay tools
- We do not track your browsing history. The browser extension only sees a page when you actively click "save"

## How we use your data

- To provide the service: authenticate you, store and display your lists and bookmarks
- To keep the service secure: detect abuse, debug errors, prevent unauthorised access
- To communicate with you about your account if required (e.g. password resets, security notices)

We rely on the following lawful bases under UK GDPR / EU GDPR:
- **Contract** — to provide the service you have signed up for
- **Legitimate interests** — to keep the service secure and working
- **Consent** — for any optional features you explicitly opt into

## Where your data is stored

Your account data and content are stored on servers operated by **DigitalOcean** in [data centre region — fill in, e.g. London (LON1) or Frankfurt (FRA1)]. DigitalOcean acts as our data processor.

The bearer token used by the browser extension is stored only inside your own browser, via the browser's `chrome.storage` API. It is not synced to any third-party service by us.

## Sharing with third parties

We share data only with infrastructure providers strictly necessary to run the service:

| Provider | Purpose | Location |
|---|---|---|
| DigitalOcean | Application hosting and database | [fill in region] |
| [Any email provider you use, e.g. Postmark / Resend] | Sending transactional email (sign-up, password reset) | [region] |

We do not share your data with any other third party except where required by law.

## How long we keep your data

- **Account and content data**: kept while your account is active. If you delete your account, we permanently delete your data within 30 days.
- **Server logs**: kept for up to 30 days, then deleted.
- **Bearer tokens**: invalidated immediately when you disconnect the extension or sign out.

## Your rights

If you live in the UK or EEA, you have the right to:

- Access the personal data we hold about you
- Correct inaccurate data
- Delete your account and all associated data
- Export your data in a portable format
- Object to or restrict certain processing
- Lodge a complaint with the UK Information Commissioner's Office (ICO) at https://ico.org.uk

To exercise any of these rights, email us at the address at the top of this policy. We will respond within 30 days.

## Children

Stash Squirrel is not directed at children under 13 (under 16 in some EEA countries). We do not knowingly collect personal data from children. If you believe a child has signed up, contact us and we will delete the account.

## International transfers

Our infrastructure is hosted in [fill in region]. If you access the service from outside that region, your data will be transferred there. Where data is transferred outside the UK/EEA, we rely on the Standard Contractual Clauses approved by the UK ICO / European Commission.

## Browser extension specifics

The Stash Squirrel browser extension:

- Requests the `activeTab` permission so it can read the URL and title of the page you are currently viewing — **only when you click the extension's icon and choose to save**
- Requests the `storage` permission to store your authentication token locally in your browser
- Requests access to `https://stash-squirrel.com` so it can send your saved pages to your account
- Does not load remote code, does not contain analytics, and does not track your browsing

You can revoke the extension's access at any time by clicking "Disconnect" inside the extension, or by removing the extension from your browser.

## Changes to this policy

If we make material changes, we will update the "Last updated" date at the top and, where appropriate, notify you by email or in the app before the change takes effect.

## Contact

Questions about this policy, or requests to exercise your data rights:

> Martin Stickley
> [UK Postbox street address]
> Email: mds1966@gmail.com
