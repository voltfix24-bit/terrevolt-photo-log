/** Keyset pages have no arbitrary maximum; the empty/short server page is the end. */
export async function leesAllePaginas<T extends { id: string }>(page: (after: string | null, size: number) => Promise<T[]>, size = 250): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const next = await page(after, size);
    rows.push(...next);
    if (next.length < size) return rows;
    const last = next[next.length - 1]?.id;
    if (!last || last === after) throw new Error("Paginering maakt geen voortgang");
    after = last;
  }
}