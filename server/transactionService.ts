import fs from 'fs';
import path from 'path';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
export type ReturnStatus =
  | 'RETURN REQUESTED'
  | 'RETURN ACCEPTED'
  | 'PRODUCT COLLECTED'
  | 'REFUND PROCESSING'
  | 'REFUNDED';
export type SettlementStatus = 'NOT_SETTLED' | 'PROCESSING' | 'SETTLED' | 'FAILED';

export interface ServerTransaction {
  id: string; // e.g. TXN-1001
  orderId: string;
  customerName: string;
  userId: string;
  paymentMethod: 'UPI';
  originalAmount: number;
  paymentStatus: PaymentStatus;
  razorpayPaymentId?: string;
  razorpayOrderId: string;
  createdAt: string;
  returnStatus?: ReturnStatus;
  refundAmount?: number;
  razorpayRefundId?: string;
  refundCreatedAt?: string;
  settlementStatus: SettlementStatus;
  settlementDate?: string;
}

const TRANSACTIONS_STORE_FILE = path.resolve(process.cwd(), '.data/transactions.json');

const INITIAL_DEMO_TRANSACTIONS: ServerTransaction[] = [
  {
    id: 'TXN-9021',
    orderId: '#FC-88120',
    customerName: 'Alex Morgan',
    userId: 'cust-demo-1',
    paymentMethod: 'UPI',
    originalAmount: 941,
    paymentStatus: 'PAID',
    razorpayPaymentId: 'pay_Kq92Ab8c01dEf2',
    razorpayOrderId: 'order_Kq81Za9b01cDe3',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    settlementStatus: 'SETTLED',
    settlementDate: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
  {
    id: 'TXN-9022',
    orderId: '#FC-75402',
    customerName: 'Alex Morgan',
    userId: 'cust-demo-1',
    paymentMethod: 'UPI',
    originalAmount: 1774,
    paymentStatus: 'PAID',
    razorpayPaymentId: 'pay_Lp83Cd9e02fGh4',
    razorpayOrderId: 'order_Lp72Yb0c02dEf5',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    settlementStatus: 'SETTLED',
    settlementDate: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: 'TXN-9023',
    orderId: '#FC-99412',
    customerName: 'Rahul',
    userId: 'rahul123',
    paymentMethod: 'UPI',
    originalAmount: 648,
    paymentStatus: 'PAID',
    razorpayPaymentId: 'pay_Mn74Ef0g03hIj6',
    razorpayOrderId: 'order_Mn63Xc1d03eFg7',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    settlementStatus: 'PROCESSING',
  },
];

export function getStoredTransactions(): ServerTransaction[] {
  try {
    if (fs.existsSync(TRANSACTIONS_STORE_FILE)) {
      const raw = fs.readFileSync(TRANSACTIONS_STORE_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch {
    // fallback
  }
  return [...INITIAL_DEMO_TRANSACTIONS];
}

export function saveStoredTransactions(transactions: ServerTransaction[]): void {
  try {
    const dir = path.dirname(TRANSACTIONS_STORE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TRANSACTIONS_STORE_FILE, JSON.stringify(transactions, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

export function recordNewTransaction(txn: Omit<ServerTransaction, 'id'> & { id?: string }): ServerTransaction {
  const transactions = getStoredTransactions();
  const id = txn.id || `TXN-${Math.floor(1000 + Math.random() * 9000)}`;
  const fullTxn: ServerTransaction = {
    ...txn,
    id,
    settlementStatus: txn.settlementStatus || 'NOT_SETTLED',
  };

  // Upsert by orderId or id
  const existingIdx = transactions.findIndex((t) => t.orderId === txn.orderId || t.id === id);
  if (existingIdx >= 0) {
    transactions[existingIdx] = {
      ...transactions[existingIdx],
      ...fullTxn,
    };
  } else {
    transactions.unshift(fullTxn);
  }

  saveStoredTransactions(transactions);
  return fullTxn;
}

export function updateTransaction(
  orderId: string,
  updates: Partial<ServerTransaction>
): ServerTransaction | null {
  const transactions = getStoredTransactions();
  const normalizedId = orderId.startsWith('#') ? orderId : `#${orderId}`;
  const unhashedId = orderId.replace(/^#/, '');

  const idx = transactions.findIndex(
    (t) => t.orderId === normalizedId || t.orderId === unhashedId || t.id === orderId
  );
  if (idx === -1) return null;

  transactions[idx] = {
    ...transactions[idx],
    ...updates,
  };

  saveStoredTransactions(transactions);
  return transactions[idx];
}

export function getTransactionByOrderId(orderId: string): ServerTransaction | null {
  const transactions = getStoredTransactions();
  const normalizedId = orderId.startsWith('#') ? orderId : `#${orderId}`;
  const unhashedId = orderId.replace(/^#/, '');
  return (
    transactions.find((t) => t.orderId === normalizedId || t.orderId === unhashedId) || null
  );
}
