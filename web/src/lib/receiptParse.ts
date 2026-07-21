/** Parse OCR / receipt text into a draft expense transaction. */
export type ParsedReceipt = {
  amount: number | null;
  categoryName: string;
  memo: string;
  dateHint: string | null;
};

const AMOUNT_PATTERNS = [
  /(?:total|grand\s*total|amount\s*due|net\s*amount|paid|balance\s*due)\s*[:\-]?\s*(?:INR|Rs\.?|₹|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  /\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  /([\d,]+(?:\.\d{1,2})?)\s*(?:INR|Rs\.?|₹)/i,
];

const DATE_PATTERNS = [
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
  /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i,
];

function parseAmount(text: string): number | null {
  for (const re of AMOUNT_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  // fallback: largest money-like number
  const nums: number[] = [];
  const re = /([\d,]+\.\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) nums.push(n);
  }
  if (nums.length) return Math.max(...nums);
  return null;
}

function guessMerchant(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 40 && !/^\d+$/.test(l));
  const skip = /total|amount|invoice|receipt|tax|gst|cgst|sgst|thank|visit|phone|date|bill/i;
  const candidate = lines.find((l) => !skip.test(l) && /[A-Za-z]/.test(l));
  return (candidate || 'Receipt').slice(0, 40);
}

export function parseReceiptText(raw: string): ParsedReceipt {
  const text = raw.replace(/\t/g, ' ').trim();
  const amount = parseAmount(text);
  const categoryName = guessMerchant(text);
  let dateHint: string | null = null;
  for (const re of DATE_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]) {
      dateHint = m[1];
      break;
    }
  }
  return {
    amount,
    categoryName,
    memo: text.slice(0, 200),
    dateHint,
  };
}
