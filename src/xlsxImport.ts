/** Small, dependency-free reader for the simple tabular XLSX files used by the test lab. */
type Row = Record<string, string>;

async function unzip(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = new Map<string, string>();
  let offset = 0;
  while (offset + 30 <= bytes.length && new DataView(bytes.buffer, bytes.byteOffset + offset).getUint32(0, true) === 0x04034b50) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    const method = view.getUint16(8, true); const compressed = view.getUint32(18, true); const nameLength = view.getUint16(26, true); const extraLength = view.getUint16(28, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength)); const start = offset + 30 + nameLength + extraLength; const data = bytes.slice(start, start + compressed);
    const output = method === 0 ? data : new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat))).arrayBuffer());
    files.set(name, new TextDecoder().decode(output)); offset = start + compressed;
  }
  return files;
}

function value(cell: Element, shared: string[]) { const type = cell.getAttribute('t'); const raw = cell.querySelector('v')?.textContent ?? cell.querySelector('t')?.textContent ?? ''; return type === 's' ? shared[Number(raw)] ?? '' : raw; }
function sheetRows(xml: string, shared: string[]): Row[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml'); const rowElements = [...doc.querySelectorAll('sheetData > row')];
  const matrix = rowElements.map((row) => [...row.querySelectorAll('c')].reduce<string[]>((cells, cell) => { const ref = cell.getAttribute('r') ?? 'A1'; const column = ref.replace(/\d/g, '').split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1; cells[column] = value(cell, shared); return cells; }, []));
  const headers = matrix.shift() ?? []; return matrix.filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

export async function xlsxRows(file: File): Promise<Row[]> {
  const files = await unzip(file); const sharedXml = files.get('xl/sharedStrings.xml') ?? ''; const sharedDoc = new DOMParser().parseFromString(sharedXml, 'application/xml'); const shared = [...sharedDoc.querySelectorAll('si')].map((item) => item.textContent ?? '');
  for (const [name, xml] of files) if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) { const rows = sheetRows(xml, shared); if (rows.length && 'Team A' in rows[0] && 'Team B' in rows[0]) return rows; }
  throw new Error('No Matches sheet');
}
