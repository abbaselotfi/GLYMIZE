const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toAsciiDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const p = PERSIAN_DIGITS.indexOf(digit);
    if (p >= 0) return String(p);
    const a = ARABIC_DIGITS.indexOf(digit);
    return a >= 0 ? String(a) : digit;
  });
}

export function normalizePatientCode(value: string) {
  return toAsciiDigits(value)
    .trim()
    .toUpperCase()
    .replace(/[\s\-_/\\\.]+/g, "");
}

export function validateIranianNationalId(value: string) {
  const code = normalizePatientCode(value);
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) {
    return false;
  }

  const check = Number(code[9]);
  const sum = code
    .slice(0, 9)
    .split("")
    .reduce(
      (total, digit, index) =>
        total + Number(digit) * (10 - index),
      0,
    );
  const remainder = sum % 11;
  return check === (remainder < 2 ? remainder : 11 - remainder);
}
