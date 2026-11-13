"use client";

import { Banknote, Loader2, Users, X } from "lucide-react";
import { ClientLookupDto, Currency, ExchangeDirection, ExchangeRateDto, ExchangeType, formatNumber, getClientLookup } from "@/lib/api";
import { ModalWrapper, foreignTradeCurrencies, formatRate } from "../helpers";
import { useBaseCurrency } from "@/lib/useBaseCurrency";
import { useEffect, useState } from "react";

export function NewExchangeModal({
  rates,
  clients,
  onClose,
  onSubmit,
  loading,
}: {
  rates: Record<number, ExchangeRateDto>;
  clients: ClientLookupDto[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const { base, baseCode } = useBaseCurrency();
  const [clientId, setClientId] = useState("");
  // The lookup holds the first 200 clients; typing asks the server for the rest
  // (client 201 onward could never be chosen here).
  const [clientQuery, setClientQuery] = useState("");
  const [found, setFound] = useState<ClientLookupDto[] | null>(null);
  useEffect(() => {
    const term = clientQuery.trim();
    if (term.length < 2) { setFound(null); return; }
    const t = setTimeout(() => {
      getClientLookup(term).then((r) => { if (r.success && r.data) setFound(r.data); }).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [clientQuery]);
  const shownClients = found ?? clients;
  const [clientName, setClientName] = useState(""); // NEW: For walk-in clients
  const [exchangeType, setExchangeType] = useState<ExchangeType>(
    ExchangeType.Cash,
  );
  const [direction, setDirection] = useState<ExchangeDirection>(
    ExchangeDirection.UsdToKes,
  );
  // Foreign side of the trade — only currencies with an active rate are offered.
  const rateCurrencies = foreignTradeCurrencies(base).filter((c) => rates[c.value]);
  const [foreignCurrency, setForeignCurrency] = useState<number>(
    rateCurrencies[0]?.value ?? Currency.USD,
  );
  const fx = foreignTradeCurrencies(base).find((c) => c.value === foreignCurrency)?.code ?? "USD";
  const currentRate = rates[foreignCurrency] ?? null;
  const [amount, setAmount] = useState("");
  const [clientIdNumber, setClientIdNumber] = useState("");
  const [notes, setNotes] = useState("");

  const rate =
    direction === ExchangeDirection.UsdToKes
      ? currentRate?.buyRate
      : currentRate?.sellRate;
  const spread = currentRate ? currentRate.sellRate - currentRate.buyRate : 0;

  const amountNum = parseFloat(amount) || 0;
  // Mirrors the server: 2dp, half away from zero.
  const receivedAmount =
    Math.round(
      (direction === ExchangeDirection.UsdToKes
        ? amountNum * (rate || 0)
        : amountNum / (rate || 1)) * 100,
    ) / 100;
  const profit =
    direction === ExchangeDirection.UsdToKes
      ? spread * amountNum
      : spread * receivedAmount;

  // UPDATED: Validation logic - Cash can use clientName, Account requires clientId
  const isValid =
    (exchangeType === ExchangeType.Cash
      ? clientId || clientName.trim()
      : clientId) &&
    amountNum > 0 &&
    currentRate;

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">New Exchange</h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* Exchange Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Exchange Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setExchangeType(ExchangeType.Cash);
                  // Don't clear clientId - user might want to select existing client
                }}
                className={`rounded-lg px-4 py-2 border text-sm font-medium ${
                  exchangeType === ExchangeType.Cash
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Banknote className="w-4 h-4 inline mr-2" />
                Cash
              </button>
              <button
                type="button"
                onClick={() => {
                  setExchangeType(ExchangeType.FromAccount);
                  setClientName(""); // Clear clientName when switching to Account
                }}
                className={`rounded-lg px-4 py-2 border text-sm font-medium ${
                  exchangeType === ExchangeType.FromAccount
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Users className="w-4 h-4 inline mr-2" />
                From Account
              </button>
            </div>
          </div>

          {/* Client Selection - UPDATED */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client{" "}
              {exchangeType === ExchangeType.FromAccount && (
                <span className="text-red-600">*</span>
              )}
              {exchangeType === ExchangeType.Cash && (
                <span className="text-gray-600 text-xs ml-1">(Optional)</span>
              )}
            </label>
            <input
              value={clientQuery}
              onChange={(e: any) => setClientQuery(e.target.value)}
              placeholder="Find client by name, phone or code"
              className="mb-2 rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={clientId}
              onChange={(e: any) => {
                setClientId(e.target.value);
                const c = shownClients.find((cl) => cl.id === e.target.value);
                if (c?.idPassport) setClientIdNumber(c.idPassport);
                if (e.target.value) setClientName(""); // Clear clientName if selecting a client
              }}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">
                {exchangeType === ExchangeType.Cash
                  ? "Select client or enter name below..."
                  : "Select client..."}
              </option>
              {shownClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* NEW: Walk-in Client Name - Only for Cash when no client selected */}
          {exchangeType === ExchangeType.Cash && !clientId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e: any) => setClientName(e.target.value)}
                className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter walk-in client name"
              />
              <p className="text-xs text-gray-600 mt-1">
                Required for walk-in cash customers without an account
              </p>
            </div>
          )}

          {/* Currency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <div className="grid grid-cols-3 gap-2">
              {foreignTradeCurrencies(base).map((c) => {
                const has = !!rates[c.value];
                return (
                  <button
                    key={c.value}
                    type="button"
                    disabled={!has}
                    title={has ? undefined : `Set a ${c.code} rate first`}
                    onClick={() => setForeignCurrency(c.value)}
                    className={`rounded-lg px-3 py-2 border text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                      foreignCurrency === c.value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {c.code}
                  </button>
                );
              })}
            </div>
            {rateCurrencies.length === 0 && (
              <p className="text-xs text-red-600 mt-1">
                No exchange rate is set. Set a rate before trading.
              </p>
            )}
          </div>

          {/* Direction */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Direction
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection(ExchangeDirection.UsdToKes)}
                className={`rounded-lg px-4 py-2 border text-sm font-medium ${
                  direction === ExchangeDirection.UsdToKes
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {fx} → {baseCode}
              </button>
              <button
                type="button"
                onClick={() => setDirection(ExchangeDirection.KesToUsd)}
                className={`rounded-lg px-4 py-2 border text-sm font-medium ${
                  direction === ExchangeDirection.KesToUsd
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {baseCode} → {fx}
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount the client gives (
              {direction === ExchangeDirection.UsdToKes ? fx : baseCode})
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e: any) => setAmount(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>

          {/* ID Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client ID Number
            </label>
            <input
              type="text"
              value={clientIdNumber}
              onChange={(e: any) => setClientIdNumber(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ID/Passport number"
            />
          </div>

          {/* Calculation Preview */}
          {amountNum > 0 && rate && (
            <div className="bg-gray-50 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Rate:</span>
                <span className="font-medium">{formatRate(rate)} {baseCode} per {fx}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Client Receives:</span>
                <span className="font-semibold text-emerald-700">
                  {direction === ExchangeDirection.UsdToKes
                    ? `${baseCode} ${formatNumber(receivedAmount)}`
                    : `${fx} ${formatNumber(receivedAmount)}`}
                </span>
              </div>
              <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-2">
                <span className="text-gray-600">Your Profit:</span>
                <span className="font-semibold text-blue-600">
                  {baseCode} {formatNumber(profit)}
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e: any) => setNotes(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="Additional notes..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                clientId: clientId || undefined,
                clientName:
                  !clientId && exchangeType === ExchangeType.Cash
                    ? clientName.trim()
                    : undefined,
                exchangeType,
                direction,
                foreignCurrency,
                amount: amountNum,
                clientIdNumber: clientIdNumber || undefined,
                notes: notes || undefined,
              })
            }
            disabled={!isValid || loading}
            className="rounded-lg px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Complete Exchange
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
