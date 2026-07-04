import { prisma } from './db';

export async function assertAccountOwned(userId: string, accountId: number) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) {
    throw new Error('Account not found');
  }
  return account;
}

export async function assertTransactionOwned(userId: string, transactionId: number) {
  const tx = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
  });
  if (!tx) {
    throw new Error('Transaction not found');
  }
  return tx;
}

export async function assertIncomeOwned(userId: string, incomeId: number) {
  const income = await prisma.income.findFirst({
    where: { id: incomeId, userId },
  });
  if (!income) {
    throw new Error('Income not found');
  }
  return income;
}

export async function assertExpenseOwned(userId: string, expenseId: number) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, userId },
  });
  if (!expense) {
    throw new Error('Expense not found');
  }
  return expense;
}
