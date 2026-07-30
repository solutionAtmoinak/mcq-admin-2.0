// Pure type + helpers for the admin-configurable status/difficulty option
// lists sourced from the DB's _InternalService table (see serviceConfig.ts
// for the actual fetch). No server-only imports here: this shape is passed
// down into client components as a prop, same as ReferenceData.

// `label` is the row's raw ServiceLabel, normalized to uppercase (a stable
// machine name, e.g. "APPROVED", "DRAFT") — business logic resolves "the
// value that means approved/draft/etc." by this key instead of hardcoding a
// number. `displayLabel` is the human display text (ServiceDisplayLabel),
// safe to rename in the DB without touching behavior — use this one for
// anything rendered in the UI.
//
// `value` stays `any`: today every category holds numeric codes (converted
// from the DB's text column in serviceConfig.ts), but a future category
// could just as well store a non-numeric code, and this type shouldn't
// assume otherwise.
export type ServiceOption = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally open: see comment above
  value: any;
  label: string;
  displayLabel: string;
  description?: string;
  category: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- key mirrors ServiceOption.value
export function toLabelRecord(options: ServiceOption[]): Record<any, string> {
  return Object.fromEntries(options.map((o) => [o.value, o.displayLabel]));
}

// label (machine key, e.g. "APPROVED") -> value. Useful for reconstructing
// an enum-shaped lookup (`{ DRAFT: 0, APPROVED: 4, ... }`) from a fetched
// options list without hardcoding the numbers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- value mirrors ServiceOption.value
export function toValueRecord(options: ServiceOption[]): Record<string, any> {
  return Object.fromEntries(options.map((o) => [o.label, o.value]));
}

// Picks the value for one specific semantic row (e.g. label: "APPROVED")
// out of an already-fetched options list. Returns undefined if that row
// doesn't exist or isn't active — callers that treat this as a required
// control-flow branch should use serviceConfig.ts's getServiceValue
// (server-only) instead, which throws.
export function valueByLabel(
  options: ServiceOption[],
  label: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- return type mirrors ServiceOption.value
): any | undefined {
  return options.find((o) => o.label === label)?.value;
}
