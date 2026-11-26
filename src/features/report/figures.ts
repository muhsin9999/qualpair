import type { Code } from '../../types';
import type { CodeAgreement } from '../../services/results';
import type { ThemeRow } from '../../services/report';

/** Figures are plain SVG strings so the same markup previews on screen and exports to PNG/SVG/DOCX. */

const FONT = `font-family="Source Sans 3, Arial, sans-serif"`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const ACCENTS = ['#222222', '#1F5A99', '#9A4A3A', '#6B7F3A'];

export function prevalenceSvg(themes: ThemeRow[], total: number, highlightId: string | undefined, accent = '#222222', width = 520): string {
  const rows = themes.filter((t) => !t.heldBack);
  const rowH = 22;
  const labelW = 170;
  const barMax = width - labelW - 40;
  const h = rows.length * rowH + 4;
  const bars = rows
    .map((t, i) => {
      const y = i * rowH;
      const w = total ? Math.max(1, (t.participants / total) * barMax) : 0;
      const hi = highlightId ? t.code.id === highlightId : i === 0;
      return `<text x="${labelW - 8}" y="${y + 14}" text-anchor="end" font-size="11" fill="#414042">${esc(t.code.name)}</text>
<rect x="${labelW}" y="${y + 3}" width="${w.toFixed(1)}" height="14" fill="${hi ? accent : '#B8B8B8'}"/>
<text x="${labelW + w + 5}" y="${y + 14}" font-size="11" ${hi ? 'font-weight="700"' : ''} fill="#222222">${t.participants}</text>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${h}" width="${width}" height="${h}" ${FONT}>${bars}</svg>`;
}

export function agreementSvg(rows: CodeAgreement[], threshold: number, width = 520): string {
  const data = rows.filter((r) => !r.insufficient && (r.laptop?.kappa != null || r.cloud?.kappa != null)).sort((a, b) => Math.min(a.laptop?.kappa ?? 1, a.cloud?.kappa ?? 1) - Math.min(b.laptop?.kappa ?? 1, b.cloud?.kappa ?? 1));
  const labelW = 170;
  const plotW = width - labelW - 20;
  const rowH = 22;
  const top = 18;
  const h = top + data.length * rowH + 26;
  const x = (k: number) => labelW + Math.max(0, Math.min(1, k)) * plotW;
  const grid = [0, 0.2, 0.4, 0.6, 0.8, 1]
    .map((g) => `<line x1="${x(g)}" x2="${x(g)}" y1="${top - 4}" y2="${top + data.length * rowH}" stroke="#E3E3E3"/><text x="${x(g)}" y="${top + data.length * rowH + 14}" text-anchor="middle" font-size="10" fill="#707071">${g.toFixed(1)}</text>`)
    .join('');
  const th = `<line x1="${x(threshold)}" x2="${x(threshold)}" y1="${top - 8}" y2="${top + data.length * rowH}" stroke="#222" stroke-dasharray="4 3"/><text x="${x(threshold) + 4}" y="${top - 8}" font-size="10" fill="#222">Pass mark, κ = ${threshold.toFixed(2)}</text>`;
  const dots = data
    .map((r, i) => {
      const y = top + i * rowH + 11;
      const l = r.laptop?.kappa;
      const c = r.cloud?.kappa;
      return `<text x="${labelW - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#414042">${esc(r.code.name)}</text>
${l != null && c != null ? `<line x1="${x(l)}" x2="${x(c)}" y1="${y}" y2="${y}" stroke="#B8B8B8" stroke-width="2"/>` : ''}
${l != null ? `<circle cx="${x(l)}" cy="${y}" r="5" fill="#1F5E57"/>` : ''}
${c != null ? `<circle cx="${x(c)}" cy="${y}" r="5" fill="#3F5F8F"/>` : ''}`;
    })
    .join('\n');
  const legend = `<circle cx="${labelW + 6}" cy="${h - 4}" r="4" fill="#1F5E57"/><text x="${labelW + 14}" y="${h - 1}" font-size="10" fill="#414042">Laptop reader vs researcher</text><circle cx="${labelW + 170}" cy="${h - 4}" r="4" fill="#3F5F8F"/><text x="${labelW + 178}" y="${h - 1}" font-size="10" fill="#414042">Cloud reader vs researcher</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${h + 6}" width="${width}" height="${h + 6}" ${FONT}>${grid}${th}${dots}${legend}</svg>`;
}

/** `marked`: codes below the pass mark, drawn with a superscript a and lighter text. */
export function matrixSvg(codes: Code[], labels: string[], matrix: Map<string, Map<string, number>>, width = 520, marked: Set<string> = new Set()): string {
  const labelW = 150;
  const cols = labels.length;
  const cellW = Math.min(36, (width - labelW - 40) / Math.max(1, cols));
  const cellH = 18;
  const top = 18;
  const shade = (v: number) => (v === 0 ? '#F1EFEA' : v === 1 ? '#C9C9C9' : v <= 3 ? '#8A8A8A' : '#333333');
  const head = labels.map((l, i) => `<text x="${labelW + i * cellW + cellW / 2}" y="12" text-anchor="middle" font-size="9.5" fill="#414042">${esc(l)}</text>`).join('');
  const body = codes
    .map((c, r) => {
      const m = matrix.get(c.id) ?? new Map();
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      const cells = labels.map((l, i) => `<rect x="${labelW + i * cellW + 1}" y="${top + r * cellH + 1}" width="${cellW - 2}" height="${cellH - 2}" fill="${shade(m.get(l) ?? 0)}"/>`).join('');
      const low = marked.has(c.id);
      return `<text x="${labelW - 8}" y="${top + r * cellH + 13}" text-anchor="end" font-size="10.5" fill="${low ? '#8A8A8A' : '#414042'}">${esc(c.name)}${low ? '<tspan baseline-shift="super" font-size="7">a</tspan>' : ''}</text>${cells}<text x="${labelW + cols * cellW + 6}" y="${top + r * cellH + 13}" font-size="10" fill="#222">${total}</text>`;
    })
    .join('');
  const ly = top + codes.length * cellH + 16;
  // Lay the legend out by text length so labels never run into the next swatch.
  let lx = Math.max(0, labelW - 120);
  const legend = [['0 paragraphs', '#F1EFEA'], ['1 paragraph', '#C9C9C9'], ['2–3 paragraphs', '#8A8A8A'], ['4+ paragraphs', '#333333']]
    .map(([t, f]) => {
      const item = `<rect x="${lx}" y="${ly - 9}" width="12" height="12" fill="${f}"/><text x="${lx + 16}" y="${ly + 1}" font-size="10" fill="#414042">${t}</text>`;
      lx += 16 + t!.length * 5.6 + 16;
      return item;
    })
    .join('');
  const h = ly + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${h}" width="${width}" height="${h}" ${FONT}>${head}${body}${legend}</svg>`;
}

/** Rasterise an SVG string to PNG bytes (for DOCX and PNG download). */
export async function svgToPng(svg: string, scale = 2): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const m = svg.match(/width="([\d.]+)" height="([\d.]+)"/);
  const width = Number(m?.[1] ?? 520);
  const height = Number(m?.[2] ?? 300);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}
