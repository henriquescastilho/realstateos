/**
 * Simulated account balance store.
 * Uses the same module-level store + listener pattern as auth.ts.
 * Default: R$ 54.000,00 (5400000 centavos).
 */

const STORAGE_KEY = "reos_balance";
const DEFAULT_BALANCE = 5_400_000; // centavos

type Listener = () => void;

let _balance: number = DEFAULT_BALANCE;
const _listeners = new Set<Listener>();

function notify() {
  _listeners.forEach((l) => l());
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, String(_balance));
  } catch {
    // ignore
  }
}

// Hydrate on module import
if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) _balance = parsed;
    }
  } catch {
    // ignore
  }
}

export function getBalance(): number {
  return _balance;
}

export function getBalanceSnapshot(): number {
  return _balance;
}

export function subscribeBalance(listener: Listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function setBalance(cents: number) {
  _balance = cents;
  persist();
  notify();
}

export function deductBalance(cents: number) {
  _balance = Math.max(0, _balance - cents);
  persist();
  notify();
}

export function creditBalance(cents: number) {
  _balance += cents;
  persist();
  notify();
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
