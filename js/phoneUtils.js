import whatsappService from "./whatsappService.js";

const E164_REGEX = /^\+\d{10,15}$/;
const DIGITS_REGEX = /^\d{10,15}$/;

function tryNormalizeWithService(rawPhone, options = {}) {
  if (!rawPhone) return null;
  const normalizer = whatsappService?.normalizePhoneNumber;
  if (typeof normalizer !== "function") return null;

  try {
    const result = normalizer(rawPhone, options);
    return result || null;
  } catch (error) {
    if (typeof window !== "undefined" && window.__DEBUG__) {
      console.warn("[phoneUtils] Falha ao normalizar telefone:", error);
    }
    return null;
  }
}

function stripToDigits(value) {
  if (!value) return "";
  return String(value).replace(/\D/g, "");
}

export function normalizePhoneToE164(rawPhone, options = {}) {
  const {
    countryCode = "55",
    keepOriginalOnFailure = true,
    allowFlexibleFallback = true,
  } = options;

  if (!rawPhone) return "";

  const trimmed = String(rawPhone).trim();
  if (!trimmed) return "";

  if (E164_REGEX.test(trimmed)) {
    return trimmed;
  }

  const baseOptions = { countryCode, addNinthDigit: true };

  const strictNormalized = tryNormalizeWithService(trimmed, {
    ...baseOptions,
    strict: true,
  });
  if (strictNormalized && DIGITS_REGEX.test(strictNormalized)) {
    return `+${strictNormalized}`;
  }

  if (allowFlexibleFallback) {
    const relaxedNormalized = tryNormalizeWithService(trimmed, {
      ...baseOptions,
      strict: false,
    });
    if (relaxedNormalized && DIGITS_REGEX.test(relaxedNormalized)) {
      return `+${relaxedNormalized}`;
    }
  }

  let digits = stripToDigits(trimmed);
  if (!digits) {
    return keepOriginalOnFailure ? trimmed : "";
  }

  digits = digits.replace(/^00+/, "");

  if (digits.length >= 11 && digits.length <= 15) {
    if (digits.startsWith(countryCode)) {
      return `+${digits}`;
    }
    if (digits.length > 11 && !digits.startsWith(countryCode)) {
      return `+${digits}`;
    }
  }

  if (digits.length === 10 || digits.length === 11) {
    return `+${countryCode}${digits}`;
  }

  if (keepOriginalOnFailure) {
    return trimmed;
  }

  return "";
}

export function formatPhoneToE164(rawPhone, options = {}) {
  const formatted = normalizePhoneToE164(rawPhone, {
    ...options,
    keepOriginalOnFailure: true,
  });
  return formatted || "";
}

export function stripPhoneDigits(rawPhone) {
  return stripToDigits(rawPhone);
}

export default {
  normalizePhoneToE164,
  formatPhoneToE164,
  stripPhoneDigits,
};
