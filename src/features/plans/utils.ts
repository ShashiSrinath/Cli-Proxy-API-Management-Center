export const formatUsd = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n)
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(n);
export const estimate = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? '—' : `≈${formatUsd(n)}`;
export function uniqueSlug(name: string, ids: string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'plan';
  let slug = base;
  let suffix = 2;
  while (ids.includes(slug)) slug = `${base}-${suffix++}`;
  return slug;
}
export const presets = [
  { name: 'Claude Pro', provider: 'claude', price: 20 },
  { name: 'Claude Max 5x', provider: 'claude', price: 100 },
  { name: 'Claude Max 20x', provider: 'claude', price: 200 },
  { name: 'ChatGPT Plus', provider: 'codex', price: 20 },
  { name: 'ChatGPT Pro', provider: 'codex', price: 200 },
  { name: 'Google AI Pro', provider: 'gemini-cli', price: 19.99 },
  { name: 'Google AI Ultra', provider: 'gemini-cli', price: 249.99 },
  { name: 'SuperGrok', provider: 'xai', price: 30 },
  { name: 'OpenCode Go', provider: 'openai-compatible-', price: 10 },
  { name: 'Command Code', provider: 'openai-compatible-', price: null },
  { name: 'OpenDesign', provider: 'openai-compatible-', price: null },
] as const;
export function presetProviders(provider: string, providers: string[]): string[] {
  return provider === 'openai-compatible-'
    ? providers.filter((p) => p.startsWith(provider))
    : providers.filter((p) => p === provider);
}
export const dateLabel = (date: string | null | undefined): string => {
  if (!date) return '—';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
};
export const relativeTime = (date: string): string => {
  const delta = new Date(date).getTime() - Date.now();
  if (!Number.isFinite(delta)) return '—';
  const abs = Math.abs(delta);
  const unit = abs >= 86400000 ? 'day' : abs >= 3600000 ? 'hour' : 'minute';
  const divisor = unit === 'day' ? 86400000 : unit === 'hour' ? 3600000 : 60000;
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
    Math.round(delta / divisor),
    unit
  );
};
