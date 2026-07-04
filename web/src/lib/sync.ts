import { prisma } from './db';
import { combineLocalDatetime } from './dates';
import { toNum } from './money';

export async function expenseReceivedTotal(expenseId: number, periodYear: number, periodMonth: number) {
  const start = new Date(periodYear, periodMonth - 1, 1);
  const end = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);
  const result = await prisma.transaction.aggregate({
    where: {
      linkedExpenseId: expenseId,
      transactionType: 'expense',
      transactionDate: { gte: start, lte: end },
    },
    _sum: { amount: true },
  });
  return toNum(result._sum.amount);
}

export async function incomeReceivedTotal(incomeId: number, periodYear: number, periodMonth: number) {
  const start = new Date(periodYear, periodMonth - 1, 1);
  const end = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);
  const result = await prisma.transaction.aggregate({
    where: {
      linkedIncomeId: incomeId,
      transactionType: 'income',
      transactionDate: { gte: start, lte: end },
    },
    _sum: { amount: true },
  });
  return toNum(result._sum.amount);
}

export async function syncExpenseFromTransactions(expenseId: number) {
  const expense = await prisma.expense.findUniqueOrThrow({ where: { id: expenseId } });
  const total = await expenseReceivedTotal(expenseId, expense.periodYear, expense.periodMonth);
  const budgeted = toNum(expense.budgetedAmount);
  const isPaid = budgeted ? total >= budgeted : total > 0;
  return prisma.expense.update({
    where: { id: expenseId },
    data: { actualAmount: total, isPaid },
  });
}

export async function autoLinkTransaction(transactionId: number) {
  const tx = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
  });
  if (tx.linkedExpenseId || tx.linkedIncomeId) return tx;

  const year = tx.transactionDate.getFullYear();
  const month = tx.transactionDate.getMonth() + 1;
  const name = tx.categoryName.trim();
  if (!name) return tx;

  if (tx.transactionType === 'expense') {
    const expenses = await prisma.expense.findMany({
      where: {
        periodYear: year,
        periodMonth: month,
        categoryName: { equals: name },
      },
    });
    // case-insensitive match in JS (sqlite limited)
    const matches = expenses.filter(
      (e) => e.categoryName.toLowerCase() === name.toLowerCase(),
    );
    const expense =
      matches.find((e) => e.accountId === tx.accountId) || matches[0];
    if (expense) {
      const updated = await prisma.transaction.update({
        where: { id: tx.id },
        data: { linkedExpenseId: expense.id },
      });
      await syncExpenseFromTransactions(expense.id);
      return updated;
    }
  } else {
    const incomes = await prisma.income.findMany({
      where: { periodYear: year, periodMonth: month },
    });
    const matches = incomes.filter(
      (i) => i.sourceName.toLowerCase() === name.toLowerCase(),
    );
    const income =
      matches.find((i) => i.accountId === tx.accountId) || matches[0];
    if (income) {
      return prisma.transaction.update({
        where: { id: tx.id },
        data: { linkedIncomeId: income.id },
      });
    }
  }
  return tx;
}

export async function createBudgetPaymentTransaction(
  expenseId: number,
  onDate?: Date,
) {
  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id: expenseId },
    include: { account: true },
  });
  await prisma.transaction.deleteMany({
    where: { linkedExpenseId: expenseId, fromBudget: true },
  });
  const received = await expenseReceivedTotal(
    expenseId,
    expense.periodYear,
    expense.periodMonth,
  );
  const remaining = toNum(expense.budgetedAmount) - received;
  if (remaining <= 0) {
    await syncExpenseFromTransactions(expenseId);
    return null;
  }
  let payDate = onDate || new Date();
  if (
    payDate.getFullYear() !== expense.periodYear ||
    payDate.getMonth() + 1 !== expense.periodMonth
  ) {
    const lastDay = new Date(expense.periodYear, expense.periodMonth, 0).getDate();
    payDate = new Date(
      expense.periodYear,
      expense.periodMonth - 1,
      Math.min(payDate.getDate(), lastDay),
    );
  }
  const tx = await prisma.transaction.create({
    data: {
      transactionType: 'expense',
      categoryName: expense.categoryName,
      amount: remaining,
      accountId: expense.accountId,
      transactionDate: combineLocalDatetime(payDate),
      linkedExpenseId: expense.id,
      fromBudget: true,
      memo: 'Budget payment',
    },
  });
  await syncExpenseFromTransactions(expenseId);
  return tx;
}

export async function removeBudgetPaymentTransactions(expenseId: number) {
  await prisma.transaction.deleteMany({
    where: { linkedExpenseId: expenseId, fromBudget: true },
  });
  await syncExpenseFromTransactions(expenseId);
}

export async function createIncomeReceiptTransaction(
  incomeId: number,
  onDate?: Date,
  amount?: number,
) {
  const income = await prisma.income.findUniqueOrThrow({ where: { id: incomeId } });
  const planned = toNum(income.amount);
  const already = await incomeReceivedTotal(
    incomeId,
    income.periodYear,
    income.periodMonth,
  );
  const remaining = planned - already;
  if (remaining <= 0) return null;
  const payAmount = amount == null ? remaining : Math.min(amount, remaining);
  if (payAmount <= 0) return null;

  let receiptDate = onDate || new Date();
  if (
    receiptDate.getFullYear() !== income.periodYear ||
    receiptDate.getMonth() + 1 !== income.periodMonth
  ) {
    const lastDay = new Date(income.periodYear, income.periodMonth, 0).getDate();
    receiptDate = new Date(
      income.periodYear,
      income.periodMonth - 1,
      Math.min(receiptDate.getDate(), lastDay),
    );
  }

  return prisma.transaction.create({
    data: {
      transactionType: 'income',
      categoryName: income.sourceName,
      amount: payAmount,
      accountId: income.accountId,
      transactionDate: combineLocalDatetime(receiptDate),
      linkedIncomeId: income.id,
      memo: 'Salary received',
    },
  });
}
