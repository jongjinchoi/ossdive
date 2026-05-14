export function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 3600)     return Math.floor(diff / 60) + 'm'
  if (diff < 86400)    return Math.floor(diff / 3600) + 'h'
  if (diff < 604800)   return Math.floor(diff / 86400) + 'd'
  if (diff < 2592000)  return Math.floor(diff / 604800) + 'w'
  if (diff < 31536000) return Math.floor(diff / 2592000) + 'mo'
  return Math.floor(diff / 31536000) + 'y'
}

export function fmt(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n)
}

export const LANG_COLOR: Record<string, string> = {
  Python: '#3572A5',
  Rust: '#dea584',
  TypeScript: '#3178c6',
  Go: '#00ADD8',
  C: '#555555',
  'C++': '#f34b7d',
  JavaScript: '#f1e05a',
  Swift: '#F05138',
  Zig: '#ec915c',
  Dart: '#00B4AB',
  Shell: '#89e051',
}
