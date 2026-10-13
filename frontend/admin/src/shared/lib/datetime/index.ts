export function formatJST(value: string, dateStyle: "long" | "medium" = "long") {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle,
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

export function toLocal(value: string | null) {
  return value
    ? new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16)
    : "";
}

export function toUTC(value: string) {
  return value ? new Date(`${value}+09:00`).toISOString() : null;
}

export function formatRegistrationDate(value: string) {
  const normalized = /Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return formatJST(normalized, "medium");
}
