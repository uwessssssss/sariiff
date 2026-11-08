"use client";
import React, { useState, useRef, useEffect } from "react";
import { getTransactionPinStatus, verifyTransactionPin } from "@/lib/api";

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
  title?: string;
}

// Check if PIN is required for this bureau
export const checkPinStatus = async (): Promise<{
  isEnabled: boolean;
  hasPin: boolean;
}> => {
  try {
    const res = await getTransactionPinStatus();
    if (res.success && res.data) return res.data;
  } catch {}
  return { isEnabled: false, hasPin: false };
};

export function PinModal({
  isOpen,
  onClose,
  onVerified,
  title = "Enter Transaction PIN",
}: PinModalProps) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    if (isOpen) {
      setDigits(["", "", "", ""]);
      setError("");
      setVerifying(false);
      setTimeout(() => refs[0].current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDigit = async (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const arr = [...digits];
    arr[index] = value;
    setDigits(arr);
    setError("");

    if (value && index < 3) {
      refs[index + 1].current?.focus();
    }

    // Auto-submit when all 4 digits entered
    if (value && index === 3 && arr.every((d) => d)) {
      const pin = arr.join("");
      setVerifying(true);
      try {
        const result = await verifyTransactionPin(pin);
        if (result.success) {
          onVerified();
        } else {
          setError(result.message || "Incorrect PIN");
          setDigits(["", "", "", ""]);
          setTimeout(() => refs[0].current?.focus(), 100);
        }
      } catch {
        setError("Failed to verify PIN");
        setDigits(["", "", "", ""]);
        setTimeout(() => refs[0].current?.focus(), 100);
      }
      setVerifying(false);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs[index - 1].current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-indigo-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">
            Enter the 4-digit bureau PIN to continue
          </p>
        </div>

        <div className="flex gap-3 justify-center my-6">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e: any) => handleDigit(i, e.target.value)}
              onKeyDown={(e: any) => handleKeyDown(i, e)}
              disabled={verifying}
              className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all bg-gray-50 disabled:opacity-50"
            />
          ))}
        </div>

        {verifying && (
          <p className="text-center text-sm text-indigo-600 font-medium -mt-2 mb-4">
            Verifying...
          </p>
        )}
        {error && (
          <p className="text-center text-sm text-red-600 font-medium -mt-2 mb-4">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400 text-center">
            Contact your administrator if you don't know the PIN
          </p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
