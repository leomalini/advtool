/**
 * Sentinel for the "no value" option inside a Select.
 *
 * Radix's Select forbids `<SelectItem value="">` — an empty string is reserved
 * for clearing the selection and showing the placeholder, so an item carrying
 * it throws at runtime. Optional fields therefore need a real, non-empty value
 * to represent absence, converted back to null on the way out.
 *
 *   <Select value={toSelectValue(field.value)} onValueChange={(v) => field.onChange(fromSelectValue(v))}>
 *     <SelectItem value={NONE_VALUE}>Não definida</SelectItem>
 */
export const NONE_VALUE = '__none__'

/** Model value (null/undefined = absent) → Select value. */
export function toSelectValue(value: string | null | undefined): string {
  return value ?? NONE_VALUE
}

/** Select value → model value (NONE_VALUE = absent). */
export function fromSelectValue(value: string): string | null {
  return value === NONE_VALUE ? null : value
}
