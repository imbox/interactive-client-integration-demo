# htmx test server

A tiny mock backend for building and testing an **ImBox client integration**.
https://docs.imbox.io/plugins/client-integration/

It models a simple "refund" flow: a customer's receipts are shown to the agent,
who can mark individual line items and then confirm a receipt as ready for
refund. The interactive UI is driven by [htmx](https://htmx.org).

## Running it

```sh
npm install
npm start          # listens on http://localhost:4321 (override with PORT)
```

`GET /` is the client-integration endpoint: ImBox's **backend** calls it as a
webhook when an agent opens a ticket. That means it has to be reachable from the
public internet — `localhost` alone won't work. Either:

- **Tunnel it during development** with [ngrok](https://ngrok.com):

  ```sh
  ngrok http 4321
  ```

  Then register the `https://<your-id>.ngrok-free.app` URL as the integration
  endpoint in ImBox.

- **Host it on a real domain** for anything beyond local testing.

Either way, set `BASE_URL` in `server.js` to that same public URL. The HTML
renders inside a sandboxed, null-origin iframe, so the htmx `POST` URLs it
contains must be absolute — relative URLs will not resolve.

## What's in here

| File                          | Purpose                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `server.js`                   | The Express app: the three HTTP routes + template rendering.                   |
| `database-mock.js`            | The mock database (users, receipts, receipt items) + its data-access helpers.  |
| `views/receipt.mustache`      | The full HTML block for one receipt (styles + container).                      |
| `views/receipt-body.mustache` | The interactive part that htmx swaps in and out.                               |

HTML is produced with [Mustache](https://mustache.github.io/) templates — plain
HTML with `{{placeholders}}`. The values for those placeholders are prepared by
`toReceiptView()` in `server.js`.

## The HTTP API

| Method & path                 | Returns                 | Does                                              |
| ----------------------------- | ----------------------- | ------------------------------------------------- |
| `GET /`                       | Client Integration JSON | One accordion per receipt for the matched user.   |
| `POST /select/:receiptItemId` | HTML fragment           | Toggles whether a line item is marked for refund. |
| `POST /submit/:receiptId`     | HTML fragment           | Confirms / un-confirms the whole receipt.         |

The `GET /` JSON is the ImBox client-integration response. The two `POST` routes
are called by htmx from inside the rendered HTML; each returns the updated
receipt fragment, which htmx swaps into place.

### CSRF protection

Each `html` block carries a `csrf` token (`{ type: "html", csrf, html }`). The
ImBox client echoes that token back as the `X-CSRF-TOKEN` header on every htmx
request the block makes, and the two `POST` routes reject anything whose header
doesn't match (`403`). The token is a per-process secret here; a real
integration would bind it to the agent's session.

## Test data

Three users, each with two receipts (see `database-mock.js`):

- `alice@example.org`
- `bob@example.org`
- `carol@example.org`
