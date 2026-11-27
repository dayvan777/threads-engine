export const SITE = {
  name: "Купуй вчасно",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://kupuy-vchasno.vercel.app",
  tagline: "Чек правди для твоїх знижок",
};

/**
 * Дані оператора для Impressum (§5 DDG). ОБОВʼЯЗКОВО заповніть перед публікацією.
 * Можна задати через змінні середовища у Vercel.
 */
export const OPERATOR = {
  name: process.env.NEXT_PUBLIC_OPERATOR_NAME ?? "",
  street: process.env.NEXT_PUBLIC_OPERATOR_STREET ?? "",
  city: process.env.NEXT_PUBLIC_OPERATOR_CITY ?? "",
  email: process.env.NEXT_PUBLIC_OPERATOR_EMAIL ?? "",
};
export const operatorFilled = () => Boolean(OPERATOR.name && OPERATOR.street && OPERATOR.city && OPERATOR.email);
