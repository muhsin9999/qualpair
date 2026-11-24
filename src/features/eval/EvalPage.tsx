import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, Laptop } from 'lucide-react';
import { getCloudReader, getDeviceReader } from '../../ai/registry';
import { approveForCloud } from '../../domain/deid/rules';
import { agreement, formatKappa, kappaBand, seededSample } from '../../domain/stats/agreement';
import { downloadText } from '../../services/export';
import { ledgerSink, newCode } from '../../services/core';
import { PageHead, Track } from '../../app/ui';
import type { Code } from '../../types';

interface EvalFile {
  source: string;
  license: string;
  note: string;
  codes: Array<{ name: string; definition: string }>;
  units: Array<{ id: string; file: string; text: string; codes: string[] }>;
}

interface Result {
  reader: 'laptop' | 'cloud';
  model: string;
  n: number;
  seconds: number;
  perCode: Array<{ code: string; refPositives: number; kappa: number | null; ac1: number | null; po: number }>;
  macroKappa: number | null;
}

/** Runs saved in results/ (real runs, downloaded from this page). The file name carries the date. */
const SAVED = Object.entries(import.meta.glob<{ results: Result[] }>('../../../results/*.json', { eager: true, import: 'default' }))
  .flatMap(([path, f]) => f.results.map((r) => ({ ...r, date: path.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? '' })));

function ResultTable({ r, note }: { r: Result; note?: string }) {
  return (
    <div className="table-wrap">
      <div className="row" style={{ padding: '12px 14px', background: 'var(--page)', borderBottom: '1px solid var(--rule)' }}>
        {r.reader === 'laptop' ? <Laptop size={16} color="var(--laptop)" /> : <Cloud size={16} color="var(--cloud)" />}
        <strong className="spacer">{r.reader === 'laptop' ? 'Laptop reader' : 'Cloud reader'} · {r.model}{note ? <span className="small faint" style={{ fontWeight: 400 }}> · {note}</span> : null}</strong>
        <span className="small muted">{r.n} units · {(r.seconds / r.n).toFixed(1)} s per unit · macro κ {formatKappa(r.macroKappa)} ({kappaBand(r.macroKappa)})</span>
      </div>
      <table className="table">
        <thead><tr><th>Code</th><th>Reference uses</th><th>κ</th><th>AC1</th><th>Agreement</th></tr></thead>
        <tbody>{r.perCode.map((p) => <tr key={p.code}><td>{p.code}</td><td className="muted">{p.refPositives}</td><td>{formatKappa(p.kappa)} <span className="tiny faint">{kappaBand(p.kappa)}</span></td><td>{formatKappa(p.ac1)}</td><td className="muted">{Math.round(p.po * 100)}%</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/**
 * Measures each reader against a published single-expert coding (Le Foll 2025, CC BY-SA 4.0).
 * Public, already-anonymised data, so the cloud reader may read it directly.
 */
export default function EvalPage() {
  const [n, setN] = useState(60);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [err, setErr] = useState('');

  async function run(kind: 'laptop' | 'cloud') {
    setErr('');
    try {
      const data = (await (await fetch('/eval/le-foll.json')).json()) as EvalFile;
      const codes: Code[] = data.codes.map((c, i) => newCode(c.name, i % 8, { definition: c.definition }));
      const units = seededSample(data.units, n, 2026);
      const log = ledgerSink('eval');
      const got = new Map<string, string[]>();
      const t0 = performance.now();
      setProgress({ done: 0, total: units.length, label: kind === 'laptop' ? 'Laptop reader' : 'Cloud reader' });
      if (kind === 'laptop') {
        const r = getDeviceReader();
        for (const [i, u] of units.entries()) {
          const out = await r.codeSegment(codes, 'Interviewee', u.text, log);
          got.set(u.id, out.codeIds);
          setProgress({ done: i + 1, total: units.length, label: 'Laptop reader' });
        }
      } else {
        const r = getCloudReader();
        for (let i = 0; i < units.length; i += 15) {
          const batch = units.slice(i, i + 15).map((u) => ({ segmentId: u.id, participantLabel: u.file, speakerRole: 'participant' as const, text: approveForCloud(u.text, [], []) }));
          const res = await r.codeBatch(codes, batch, log);
          for (const b of batch) got.set(b.segmentId, res.get(b.segmentId)?.codeIds ?? []);
          setProgress({ done: Math.min(units.length, i + 15), total: units.length, label: 'Cloud reader' });
        }
      }
      const seconds = (performance.now() - t0) / 1000;
      const perCode = codes.map((c) => {
        const ref = units.map((u) => u.codes.includes(c.name));
        const hyp = units.map((u) => (got.get(u.id) ?? []).includes(c.id));
        const a = agreement(ref, hyp);
        return { code: c.name, refPositives: ref.filter(Boolean).length, kappa: a.kappa, ac1: a.ac1, po: a.po };
      });
      const ks = perCode.filter((p) => p.refPositives > 0 && p.kappa !== null).map((p) => p.kappa!);
      const reader = kind === 'laptop' ? getDeviceReader() : getCloudReader();
      setResults((rs) => [...rs.filter((r) => r.reader !== kind), { reader: kind, model: reader.modelName, n: units.length, seconds, perCode, macroKappa: ks.length ? ks.reduce((a, b) => a + b, 0) / ks.length : null }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="main" style={{ minHeight: '100%' }}>
      <PageHead title="Evaluation" sub="Each reader against a published expert coding: Le Foll (2025), interviews with linguists about open science, CC BY-SA 4.0">
        <Link className="btn ghost" to="/studies">Your studies</Link>
      </PageHead>
      <div className="work col" style={{ maxWidth: 1000 }}>
        {SAVED.map((r) => <ResultTable key={`${r.reader}-${r.date}`} r={r} note={`measured ${new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`} />)}
        <strong style={{ marginTop: SAVED.length ? 12 : 0 }}>Run it yourself</strong>
        <div className="card pad stack">
          <span className="small muted">12 codes, interviewee turns as units, a random sample (seed 2026). The reference is one expert coder, not a gold standard. Code definitions were written by the QualCheck team from the dataset’s code names.</span>
          <label className="row small">Units <input className="input" type="number" min={10} max={747} value={n} onChange={(e) => setN(Number(e.target.value))} style={{ width: 100 }} /></label>
          <div className="row">
            <button className="btn primary" disabled={!!progress} onClick={() => run('laptop')}><Laptop size={16} /> Run laptop reader</button>
            <button className="btn" disabled={!!progress} onClick={() => run('cloud')}><Cloud size={16} /> Run cloud reader</button>
            {results.length > 0 && <button className="btn ghost" onClick={() => downloadText(`qualcheck-eval-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ dataset: 'le-foll-2025', userAgent: navigator.userAgent, results }, null, 2), 'application/json')}>Download results</button>}
          </div>
          {progress && <><span className="small">{progress.label}: {progress.done} of {progress.total}</span><Track value={progress.done} total={progress.total} /></>}
          {err && <div className="notice">{err}</div>}
        </div>
        {results.map((r) => <ResultTable key={r.reader} r={r} note="this run" />)}
        {!results.length && <div className="small faint">The laptop reader needs Chrome with Gemini Nano; 60 units take about 5 minutes.</div>}
      </div>
    </div>
  );
}
