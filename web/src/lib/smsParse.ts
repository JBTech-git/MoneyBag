export type ParsedSmsTxn = {
  amount: number | null;
  transactionType: 'expense' | 'income';
  categoryName: string;
  memo: string;
  confidence: 'high' | 'medium' | 'low';
};

const CREDIT_RE =
  /\b(credited|credit|received|deposited|refund|cr\.?\b|money received)\b/i;
const DEBIT_RE =
  /\b(debited|debit|spent|paid|purchase|withdrawn|dr\.?\b|sent to|payment of)\b/i;

const AMOUNT_PATTERNS = [
  /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:USD|\$)\s*([\d,]+(?:\.\d{1,2})?)/i,
  /\b(?:amt|amount|rs)\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /([\d,]+(?:\.\d{1,2})?)\s*(?:INR|Rs\.?|₹)/i,
];

const MERCHANT_PATTERNS = [
  /(?:at|to|from|towards)\s+([A-Za-z0-9 &.'-]{2,40}?)(?:\s+on\s+|\s+via\s+|\s+ref|\s+upi|\s+avl|\.|$)/i,
  /UPI[-\s]?([A-Za-z0-9@.]+)/i,
  /(?:VPA|UPI ID)[:\s]+([A-Za-z0-9@.]+)/i,
];

function parseAmount(text: string): number | null {
  for (const re of AMOUNT_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function guessMerchant(text: string): string {
  for (const re of MERCHANT_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]) {
      const name = m[1].trim().replace(/\s+/g, ' ');
      if (name.length >= 2) return name.slice(0, 40);
    }
  }
  return '';
}

/**
 * Best-effort parse of bank/UPI SMS text into a draft transaction.
 * Not financial advice — user should confirm before saving.
 */
export function parseSmsOrUpiText(raw: string): ParsedSmsTxn {
  const text = raw.replace(/\s+/g, ' ').trim();
  const amount = parseAmount(text);
  const merchant = guessMerchant(text);

  let transactionType: 'expense' | 'income' = 'expense';
  if (CREDIT_RE.test(text) && !DEBIT_RE.test(text)) transactionType = 'income';
  else if (DEBIT_RE.test(text)) transactionType = 'expense';
  else if (/\b(salary|credited to)\b/i.test(text)) transactionType = 'income';

  const categoryName =
    merchant ||
    (transactionType === 'income' ? 'Bank credit' : 'UPI / Bank');

  let confidence: ParsedSmsTxn['confidence'] = 'low';
  if (amount != null && (CREDIT_RE.test(text) || DEBIT_RE.test(text))) confidence = 'high';
  else if (amount != null) confidence = 'medium';

  return {
    amount,
    transactionType,
    categoryName,
    memo: text.slice(0, 160),
    confidence,
  };
}
