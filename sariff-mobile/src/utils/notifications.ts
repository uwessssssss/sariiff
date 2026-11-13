import { secureRandomHex } from './random';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ==================== WHATSAPP DEEP LINKS ====================

/**
 * Format phone number for wa.me link (strip +, spaces, dashes)
 */
const formatPhone = (phone: string): string => {
  let clean = phone.replace(/[\s\-\(\)]/g, '');
  if (clean.startsWith('+')) clean = clean.slice(1);
  if (clean.startsWith('0') && clean.length === 10) clean = '254' + clean.slice(1); // Kenya local
  return clean;
};

/**
 * Open WhatsApp with pre-filled message to a specific number
 */
export const shareViaWhatsApp = async (phone: string, message: string): Promise<boolean> => {
  try {
    const formatted = formatPhone(phone);
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${formatted}?text=${encoded}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return true;
    }
    // Fallback: try whatsapp:// scheme
    const fallback = `whatsapp://send?phone=${formatted}&text=${encoded}`;
    await Linking.openURL(fallback);
    return true;
  } catch {
    return false;
  }
};

// ==================== MESSAGE TEMPLATES ====================

export const buildCredentialMessage = (opts: {
  role: 'office' | 'client';
  fullName: string;
  code: string;
  password: string;
  companyName?: string;
}) => {
  const { role, fullName, code, password, companyName } = opts;
  if (role === 'office') {
    return `*Welcome to ${companyName || 'Sarif'} Bureau!* 🏦\n\n` +
      `Hi ${fullName},\n\n` +
      `Your office account has been created.\n\n` +
      `*Login Code:* ${code}\n` +
      `*Password:* ${password}\n\n` +
      `Please change your password after first login.\n` +
      `If you have any questions, contact your administrator.`;
  }
  return `*Welcome to ${companyName || 'Sarif'}!* 🏦\n\n` +
    `Hi ${fullName},\n\n` +
    `Your account has been created.\n\n` +
    `*Login Code:* ${code}\n` +
    `*Password:* ${password}\n\n` +
    `📱 Download the Sarif app and login to view your account balance, statements, and transaction history.\n\n` +
    `Please change your password after first login.`;
};

export const buildPasswordResetMessage = (opts: {
  fullName: string;
  code: string;
  newPassword: string;
}) => {
  return `*Password Reset* 🔐\n\n` +
    `Hi ${opts.fullName},\n\n` +
    `Your password has been reset.\n\n` +
    `*Login Code:* ${opts.code}\n` +
    `*New Password:* ${opts.newPassword}\n\n` +
    `Please change your password after login.`;
};

export const buildTransactionMessage = (opts: {
  clientName: string;
  type: 'Credit' | 'Debit';
  amount: string;
  currency: string;
  balance: string;
  code: string;
  description: string;
  date: string;
}) => {
  const { clientName, type, amount, currency, balance, code, description, date } = opts;
  const action = type === 'Credit' ? 'credited to' : 'debited from';
  const emoji = type === 'Credit' ? '✅' : '📤';
  // balance may already carry its code ("UGX 2,400,000.00") — don't print the code twice
  const hasCode = balance.includes('|') || /^[A-Z]{3} /.test(balance);
  const balanceLine = hasCode ? `*New Balance:* ${balance}` : `*New Balance:* ${currency} ${balance}`;
  return `${emoji} *Transaction Confirmation*\n\n` +
    `Hi ${clientName},\n\n` +
    `${currency} ${amount} has been ${action} your account.\n\n` +
    `*Reference:* ${code}\n` +
    `*Description:* ${description}\n` +
    `${balanceLine}\n` +
    `*Date:* ${date}\n\n` +
    `Thank you for choosing Sarif.`;
};

export const buildExchangeMessage = (opts: {
  clientName: string;
  direction: string;
  amountGiven: string;
  currencyGiven: string;
  amountReceived: string;
  currencyReceived: string;
  rate: string;
  code: string;
  date: string;
}) => {
  return `💱 *Exchange Confirmation*\n\n` +
    `Hi ${opts.clientName},\n\n` +
    `Your exchange has been completed.\n\n` +
    `*Direction:* ${opts.direction}\n` +
    `*Given:* ${opts.currencyGiven} ${opts.amountGiven}\n` +
    `*Received:* ${opts.currencyReceived} ${opts.amountReceived}\n` +
    `*Rate:* ${opts.rate}\n` +
    `*Reference:* ${opts.code}\n` +
    `*Date:* ${opts.date}\n\n` +
    `Thank you for choosing Sarif.`;
};

// ==================== PUSH NOTIFICATIONS ====================

export const registerForPushNotifications = async (): Promise<string | null> => {
  try {
    // Dynamic imports — fail gracefully if not available (Expo Go)
    let Notifications: any;
    let Device: any;
    try {
      Notifications = require('expo-notifications');
      Device = require('expo-device');
    } catch {
      if (__DEV__) console.log('expo-notifications not available');
      return null;
    }

    if (!Device.isDevice) {
      if (__DEV__) console.log('Push notifications require physical device');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      if (__DEV__) console.log('Push notification permission denied');
      return null;
    }

    // Android notification channel must exist before requesting a token
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('transactions', {
        name: 'Transactions',
        importance: Notifications.AndroidImportance?.MAX || 4,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
      });
    }

    // Get the Expo push token — projectId is required in EAS/standalone builds
    try {
      let Constants: any;
      try { Constants = require('expo-constants'); } catch { Constants = null; }
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;

      const tokenData = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      return tokenData.data;
    } catch (tokenError: any) {
      // Expo Go (SDK 53+) or missing/placeholder projectId — non-fatal
      if (__DEV__) console.log('Push token error:', tokenError?.message);
      return null;
    }
  } catch (e) {
    if (__DEV__) console.log('Push registration error:', e);
    return null;
  }
};

// ==================== TRANSACTION PIN ====================

// H5 FIX: Local PIN removed — all PIN verification is server-side via /api/transaction-pin/verify
// These are kept as no-ops for backward compatibility (screens already use api.verifyTransactionPinBackend)
export const isPinSet = async (): Promise<boolean> => false;
export const setTransactionPin = async (_pin: string): Promise<void> => {};
export const verifyTransactionPin = async (_pin: string): Promise<boolean> => true;
export const removeTransactionPin = async (): Promise<void> => {};

// ==================== DEVICE TRUST ====================

const DEVICE_ID_KEY = 'sariff_device_id';

// A trusted device skips the SMS code, so this id is a secret: secure random bytes, kept in
// the encrypted store. It was Math.random in plain AsyncStorage, and the constant
// "unknown-device" when storage failed (the same "secret" on every such phone).
export const getDeviceId = async (): Promise<string | undefined> => {
  try {
    const SecureStore = require('expo-secure-store');
    let deviceId: string | null = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!deviceId || deviceId.length < 32) {
      deviceId = secureRandomHex(24) ?? null;
      if (!deviceId) return undefined;   // no secure randomness: no trusted device
      await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
      AsyncStorage.removeItem(DEVICE_ID_KEY).catch(() => {});   // the old plain copy
    }
    return deviceId;
  } catch {
    return undefined;
  }
};

export const getDeviceName = (): string => {
  try {
    const Device = require('expo-device');
    return `${Device.modelName || 'Mobile'} (${Platform.OS})`;
  } catch {
    return `Mobile (${Platform.OS})`;
  }
};
