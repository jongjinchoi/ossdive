export interface HnComment {
  author: string
  text:   string
  depth:  number
}

interface AlgoliaItem {
  author:     string | null
  text:       string | null
  title:      string | null
  points:     number | null
  children:   AlgoliaItem[]
}

export function extractHnItemId(hnUrl: string): string | null {
  return hnUrl.match(/item\?id=(\d+)/)?.[1] ?? null
}

export function decodeHnText(html: string): string {
  return html
    .replace(/<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g,          (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g,   ">")
    .replace(/&lt;/g,   "<")
    .replace(/&amp;/g,  "&")
    .trim()
}

function walk(node: AlgoliaItem, depth: number, out: HnComment[], limit: number): void {
  if (out.length >= limit) return
  if (node.author && node.text) {
    out.push({ author: node.author, text: decodeHnText(node.text), depth })
  }
  for (const child of node.children) {
    if (out.length >= limit) break
    walk(child, depth + 1, out, limit)
  }
}

export async function fetchHnThread(itemId: string, limit: number): Promise<HnComment[]> {
  const url = `https://hn.algolia.com/api/v1/items/${itemId}`
  const res  = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`HN API error: ${res.status} ${res.statusText}`)
  const item = (await res.json()) as AlgoliaItem
  const out: HnComment[] = []
  for (const child of item.children) {
    if (out.length >= limit) break
    walk(child, 0, out, limit)
  }
  return out
}
