// Mock database.
//
// In a real integration this data would come from your own system (a SQL
// database, an internal API, etc.). Here it lives in memory, so any changes
// (which items are `marked`, whether a receipt is `refundReady`) reset when the
// server restarts.
//
// Tables:
//   users        - the customers ImBox knows about, matched by `email`
//   receipts     - one order per row, belongs to a user (`userId`)
//   receiptItems - the line items of a receipt (`receiptId`)
//
// Everything that reads or writes `database` lives in this file, so the rest of
// the app never touches the data directly.

const database = {
  users: [
    { id: 1, email: 'alice@example.org', name: 'Alice' },
    { id: 2, email: 'bob@example.org', name: 'Bob' },
    { id: 3, email: 'carol@example.org', name: 'Carol' },
  ],

  receipts: [
    { id: 1, userId: 1, description: 'Order #1001', date: '2025-03-04', refundReady: false },
    { id: 2, userId: 1, description: 'Order #1002', date: '2025-03-18', refundReady: false },
    { id: 3, userId: 2, description: 'Order #1003', date: '2025-02-11', refundReady: false },
    { id: 4, userId: 2, description: 'Order #1004', date: '2025-02-25', refundReady: false },
    { id: 5, userId: 3, description: 'Order #1005', date: '2025-04-02', refundReady: false },
    { id: 6, userId: 3, description: 'Order #1006', date: '2025-04-16', refundReady: false },
  ],

  receiptItems: [
    { id: 1, receiptId: 1, description: 'Wireless headphones', cost: 599, marked: false },
    { id: 2, receiptId: 1, description: 'USB-C cable 2 m', cost: 149, marked: false },
    { id: 3, receiptId: 1, description: 'Laptop sleeve 14"', cost: 249, marked: false },
    { id: 4, receiptId: 2, description: 'Mechanical keyboard', cost: 899, marked: false },
    { id: 5, receiptId: 2, description: 'Phone case', cost: 129, marked: false },
    { id: 6, receiptId: 3, description: 'Coffee maker', cost: 799, marked: false },
    { id: 7, receiptId: 3, description: 'Ceramic mug set', cost: 199, marked: false },
    { id: 8, receiptId: 3, description: 'Cotton bath towels', cost: 349, marked: false },
    { id: 9, receiptId: 4, description: 'LED desk lamp', cost: 279, marked: false },
    { id: 10, receiptId: 4, description: 'Wool blanket', cost: 459, marked: false },
    { id: 11, receiptId: 5, description: 'Running shoes', cost: 1099, marked: false },
    { id: 12, receiptId: 5, description: 'Yoga mat', cost: 299, marked: false },
    { id: 13, receiptId: 5, description: 'Water bottle 1 L', cost: 159, marked: false },
    { id: 14, receiptId: 6, description: 'Sports socks 3-pack', cost: 99, marked: false },
    { id: 15, receiptId: 6, description: 'Fitness tracker', cost: 749, marked: false },
  ],
}

// --- Lookups ---------------------------------------------------------------

export function findUserByEmail(email) {
  return database.users.find((user) => user.email === email)
}

export function findReceiptById(receiptId) {
  return database.receipts.find((receipt) => receipt.id === receiptId)
}

export function findReceiptItemById(itemId) {
  return database.receiptItems.find((item) => item.id === itemId)
}

export function receiptsForUser(userId) {
  return database.receipts.filter((receipt) => receipt.userId === userId)
}

export function itemsForReceipt(receiptId) {
  return database.receiptItems.filter((item) => item.receiptId === receiptId)
}

export function allUsers() {
  return database.users
}

// --- Mutations -------------------------------------------------------------

// Toggle whether a single line item is marked for refund. Returns the updated
// item, or undefined if no item matches.
export function toggleItemMarked(itemId) {
  const item = findReceiptItemById(itemId)
  if (item) item.marked = !item.marked
  return item
}

// Toggle whether a receipt is confirmed (locked) for refund. Returns the
// updated receipt, or undefined if no receipt matches.
export function toggleReceiptRefundReady(receiptId) {
  const receipt = findReceiptById(receiptId)
  if (receipt) receipt.refundReady = !receipt.refundReady
  return receipt
}
