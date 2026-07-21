/** Days left in the given month from `asOf` (inclusive of today when in-month). */
export function daysLeftInMonth(year: number, month: number, asOf = new Date()) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const inMonth =
    asOf.getFullYear() === year && asOf.getMonth() + 1 === month;
  if (!inMonth) {
    const end = new Date(year, month, 0, 23, 59, 59);
    if (asOf > end) return 0;
    return daysInMonth;
  }
  const day = asOf.getDate();
  return Math.max(0, daysInMonth - day + 1);
}

/** Remaining budget ÷ days left → suggested daily spend pace. */
export function budgetPerDayLeft(
  budgetRemaining: number,
  year: number,
  month: number,
  asOf = new Date(),
) {
  const daysLeft = daysLeftInMonth(year, month, asOf);
  if (daysLeft <= 0) {
    return { daysLeft: 0, perDay: 0 };
  }
  return {
    daysLeft,
    perDay: budgetRemaining / daysLeft,
  };
}
