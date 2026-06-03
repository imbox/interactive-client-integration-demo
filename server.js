// Mock backend for an ImBox htmx client integration: a small "refund" flow.
//
// How it fits together:
//   1. ImBox calls  GET /?email=<contact>  and gets back a JSON document of
//      "blocks". One block per receipt, rendered as an accordion whose body is
//      an `html` block. https://docs.imbox.io/plugins/client-integration/
//   2. That HTML runs inside a sandboxed iframe in the ImBox agent client, with
//      htmx loaded. The checkboxes issue htmx requests back to this server:
//        POST /select/:receiptItemId  - mark/unmark a single line item
//        POST /submit/:receiptId      - confirm the whole receipt for refund
//      Each returns an HTML fragment that htmx swaps into the receipt.
//
// The HTML is produced with Mustache templates in ./views. Data is a mock in
// ./database-mock.js. Run with `npm start`, then expose it with ngrok (see README).

import express from 'express'
import mustache from 'mustache'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import {
  findUserByEmail,
  findReceiptById,
  findReceiptItemById,
  receiptsForUser,
  itemsForReceipt,
  allUsers,
  toggleItemMarked,
  toggleReceiptRefundReady,
} from './database-mock.js'

const PORT = process.env.PORT || 4321

// Public URL the browser uses to reach this server. The integration renders in
// a sandboxed, null-origin iframe, so URLs in the HTML must be absolute — they
// cannot be relative. Set this to your endpoint base URL.
const BASE_URL = ''

// CSRF token. We hand it to the client on every html block (as `csrf`); the
// ImBox client then echoes it back as the `X-CSRF-TOKEN` header on every htmx
// request the block makes. A forged cross-site request can't know it, so the
// POST routes reject anything that doesn't match. One secret per process is
// enough for this mock — a real integration would mint a token bound to the
// agent's session instead.
const CSRF_TOKEN = randomBytes(32).toString('hex')

function csrfValid(req) {
  const sent = Buffer.from(req.get('X-CSRF-TOKEN') ?? '')
  const expected = Buffer.from(CSRF_TOKEN)
  // timingSafeEqual needs equal-length buffers; a length mismatch is a fail.
  return sent.length === expected.length && timingSafeEqual(sent, expected)
}

// Templates are plain HTML with {{placeholders}}; load them once at startup.
const templates = {
  receipt: readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'views', 'receipt.mustache'), 'utf8'),
  receiptBody: readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'views', 'receipt-body.mustache'), 'utf8'),
}

// ---------------------------------------------------------------------------
// Helpers: shape data for the templates (data access lives in database-mock.js)
// ---------------------------------------------------------------------------

const sumCost = (items) => items.reduce((sum, item) => sum + item.cost, 0)

// Turn a receipt and its items into the plain values the Mustache templates
// expect. Mustache has no logic, so anything conditional is computed here.
function toReceiptView(receipt, items) {
  const selected = items.filter((item) => item.marked)
  return {
    baseUrl: BASE_URL,
    id: receipt.id,
    refundReady: receipt.refundReady,
    canSubmit: selected.length > 0,
    selectedCount: selected.length,
    selectedTotal: sumCost(selected),
    items: items.map((item) => ({
      id: item.id,
      receiptId: receipt.id,
      description: item.description,
      cost: item.cost,
      marked: item.marked,
      locked: receipt.refundReady, // items can't change once the receipt is confirmed
    })),
  }
}

// The full html block (initial render) vs. just the swappable inner fragment.
function renderReceiptBlock(view) {
  return mustache.render(templates.receipt, view, { body: templates.receiptBody })
}

function renderReceiptBody(view) {
  return mustache.render(templates.receiptBody, view)
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express()

// The integration runs in a cross-origin (null-origin) iframe, so allow CORS
// for every route and answer preflight requests.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ImBox calls this when an agent opens a ticket. Look the contact up by email
// and return one accordion (with an html block) per receipt.
app.get('/', (req, res) => {
  const user = findUserByEmail(req.query.email)
  const receipts = user ? receiptsForUser(user.id) : []

  const receiptBlocks = receipts.map((receipt) => {
    const items = itemsForReceipt(receipt.id)
    return {
      type: 'accordion',
      headers: [
        { text: receipt.description, subtext: receipt.date },
        {
          text: `${sumCost(items)} kr`,
          subtext: receipt.refundReady ? 'Refund ready' : `${items.length} items`,
        },
      ],
      data: [
        { type: 'html', csrf: CSRF_TOKEN, html: renderReceiptBlock(toReceiptView(receipt, items)) },
      ],
    }
  })

  const emptyBlock = {
    type: 'html',
    html: `<p style="font-size:13px;color:#66656A">No receipts found for "${req.query.email}"</p>`,
  }

  res.json({
    contactName: user?.name ?? req.query.email ?? null,
    contactLink: null,
    blocks: [
      {
        name: 'Receipts',
        icon: 'receipt',
        data: receipts.length ? receiptBlocks : [emptyBlock],
      },
    ],
  })
})

// Mark or unmark a single line item for refund.
app.post('/select/:receiptItemId', (req, res) => {
  if (!csrfValid(req)) return res.status(403).send('Invalid CSRF token')

  const item = findReceiptItemById(Number(req.params.receiptItemId))
  if (!item) return res.status(404).send('Unknown item')

  const receipt = findReceiptById(item.receiptId)
  const recieptIsLocked = receipt.refundReady
  if (!recieptIsLocked) toggleItemMarked(item.id)

  res.send(renderReceiptBody(toReceiptView(receipt, itemsForReceipt(receipt.id))))
})

// Confirm (or un-confirm) the whole receipt for refund. Only possible once at
// least one item is marked.
app.post('/submit/:receiptId', (req, res) => {
  if (!csrfValid(req)) return res.status(403).send('Invalid CSRF token')

  const receipt = findReceiptById(Number(req.params.receiptId))
  if (!receipt) return res.status(404).send('Unknown receipt')

  const items = itemsForReceipt(receipt.id)
  toggleReceiptRefundReady(receipt.id)

  res.send(renderReceiptBody(toReceiptView(receipt, items)))
})

app.listen(PORT, () => {
  console.log(`htmx test server listening on http://localhost:${PORT}`)
  console.log(`Test emails: ${allUsers().map((u) => u.email).join(', ')}`)
})
