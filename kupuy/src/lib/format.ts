export const uah = (x: number) =>
  new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(x)) + "\u00a0₴";
export const eur = (x: number) =>
  "€" + new Intl.NumberFormat("uk-UA", { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(x);
export const money = (x: number, c: "UAH" | "EUR") => (c === "UAH" ? uah(x) : eur(x));
export const pct = (x: number, signed = false) => {
  const v = Math.round(x * 100);
  return (signed && v > 0 ? "+" : "") + v + "%";
};
