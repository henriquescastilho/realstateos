/**
 * Account balance store — syncs with Santander via backend API.
 * Falls back to cached localStorage value while fetching.
 */

import { apiGet } from "./api";

const STORAGE_KEY = "reos_balance";

type Listener = () => void;

let _balance: number = 0;
let _loading = true;
let _error: string | null = null;
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

// Hydrate from cache on module import (instant display while API loads)
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

export function isBalanceLoading(): boolean {
  return _loading;
}

export function getBalanceError(): string | null {
  return _error;
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
  _balance -= cents;
  persist();
  notify();
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

// ─── Fetch from Santander via backend ───

interface BalanceAPIResponse {
  success: boolean;
  availableBalance?: number;
  totalBalance?: number;
}

let _fetchPromise: Promise<void> | null = null;

export function fetchBalanceFromAPI(): Promise<void> {
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      _loading = true;
      _error = null;
      const data = await apiGet<BalanceAPIResponse>(
        "/v1/integrations/bank/balance",
      );
      if (data.success && data.availableBalance != null) {
        _balance = Math.round(data.availableBalance * 100);
        _error = null;
        persist();
        notify();
      } else {
        _error = "Banco não retornou saldo";
        console.warn("[balance] API returned success=false or no balance:", data);
      }
    } catch (err) {
      _error = "Falha na conexão com o banco";
      console.warn("[balance] Failed to fetch from API:", err);
    } finally {
      _loading = false;
      _fetchPromise = null;
      notify();
    }
  })();

  return _fetchPromise;
}

// Auto-fetch on load
if (typeof window !== "undefined") {
  // Small delay to ensure auth token is available
  setTimeout(() => {
    void fetchBalanceFromAPI();
  }, 500);
}
