import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, Download, Laptop } from 'lucide-react';
import { getCloudReader, getDeviceReader } from '../../ai/registry';
import { approveForCloud } from '../../domain/deid/rules';
import { agreement, formatKappa, kappaBand, seededSample } from '../../domain/stats/agreement';
import { downloadText } from '../../services/export';
import { ledgerSink, newCode } from '../../services/core';
import { PageHead, Segmented, Track } from '../../app/ui';
import { Logo } from '../../app/Logo';
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
  /** Prompt versions used (the laptop reader shortens its prompt if this browser's model limit needs it). */
  prompts?: string[];
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
  const [n, setN] = useState(200);
  const [typed, setTyped] = useState('');
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
      const prompts = new Set<string>();
      const t0 = performance.now();
      setProgress({ done: 0, total: units.length, label: kind === 'laptop' ? 'Laptop reader' : 'Cloud reader' });
      if (kind === 'laptop') {
        const r = getDeviceReader();
        for (const [i, u] of units.entries()) {
          const out = await r.codeSegment(codes, 'Interviewee', u.text, log);
          got.set(u.id, out.codeIds);
          if (out.promptVersion) prompts.add(out.promptVersion);
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
      setResults((rs) => [...rs.filter((r) => r.reader !== kind), { reader: kind, model: reader.modelName, n: units.length, seconds, perCode, macroKappa: ks.length ? ks.reduce((a, b) => a + b, 0) / ks.length : null, ...(prompts.size ? { prompts: [...prompts] } : {}) }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  const latest = (k: Result['reader']) => {
    const mine = results.find((r) => r.reader === k);
    if (mine) return { r: mine, when: 'this run' };
    const old = SAVED.filter((r) => r.reader === k).at(-1);
    return old ? { r: old, when: `measured ${new Date(old.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` } : null;
  };
  const minutes = Math.max(1, Math.round((n * 5 + 60) / 60));

  return (
    <div className="main" style={{ minHeight: '100%' }}>
      <header className="st-top">
        <Link to="/" className="row" style={{ textDecoration: 'none', color: 'var(--ink)' }} aria-label="QualPair home page"><Logo size={28} fontSize={18} /></Link>
        <span className="spacer" />
        <Link className="ld-link strong" to="/studies">Your studies</Link>
      </header>
      <PageHead title="How accurate are the readers?" sub="Each reader is scored against a published expert coding: Le Foll (2025), interviews with linguists about open science, CC BY-SA 4.0." />
      <div className="work ev">
        <div className="stack grow" style={{ gap: 18, minWidth: 0 }}>
          <div className="ev-scores">
            {(['laptop', 'cloud'] as const).map((k) => {
              const l = latest(k);
              const Icon = k === 'laptop' ? Laptop : Cloud;
              return (
                <div key={k} className={`ev-score ${k}${l ? '' : ' none'}`}>
                  <span className="ev-score-who"><Icon size={16} /> {k === 'laptop' ? 'Laptop reader · Gemini Nano' : `Cloud reader · ${l?.r.model ?? 'Gemini'}`}</span>
                  {l ? (
                    <>
                      <span className="ev-score-k">κ {formatKappa(l.r.macroKappa)} <span>{kappaBand(l.r.macroKappa)}</span></span>
                      <span className="small muted">Average across codes · {l.r.n} units · {(l.r.seconds / l.r.n).toFixed(1)} s per unit · {l.when}</span>
                    </>
                  ) : (
                    <>
                      <span className="ev-score-k">Not measured yet</span>
                      <span className="small muted">Needs Chrome with Gemini Nano. Run it with the panel on the right.</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <p className="small muted" style={{ margin: 0 }}>κ (Cohen’s kappa) is agreement beyond chance: 0.41–0.60 is moderate, 0.61–0.80 substantial. We decided before seeing any result that 0.40 counts as a useful first pass and 0.60 as good. The reference is one expert coder, not a gold standard.</p>
          {results.map((r) => <ResultTable key={r.reader} r={r} note="this run" />)}
          {SAVED.map((r) => <ResultTable key={`${r.reader}-${r.date}`} r={r} note={`measured ${new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`} />)}
        </div>

        <aside className="ev-side card pad stack">
          <strong style={{ fontSize: 17 }}>Run it yourself</strong>
          <span className="small muted">A random sample of interviewee turns (seed 2026), coded with 12 codes. Code definitions were written by the QualPair team from the dataset’s code names.</span>
          <div className="stack" style={{ gap: 6 }}>
            <span className="small" style={{ fontWeight: 700 }}>How many turns</span>
            <Segmented label="How many turns" value={n} onChange={(v) => { setN(v); setTyped(''); }} options={[[60, '60'], [200, '200'], [747, 'All 747']]} />
            <label className="row small" style={{ gap: 8 }}>
              <span className="muted">or type a number</span>
              <input className="input" inputMode="numeric" placeholder="10–747" aria-label="Number of turns, 10 to 747" style={{ width: 96 }} value={typed}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 3);
                  setTyped(v);
                  const num = Number(v);
                  if (num >= 10 && num <= 747) setN(num);
                }}
                onBlur={() => { if (typed) { const num = Math.min(747, Math.max(10, Number(typed))); setN(num); setTyped(String(num)); } }} />
            </label>
            <span className="tiny faint">{n} turns. {n === 200 ? 'Same size as the saved cloud run, so the two compare directly. ' : ''}Laptop reader: about {minutes} min.</span>
          </div>
          <button className="btn primary" disabled={!!progress} onClick={() => run('laptop')}><Laptop size={16} /> Run laptop reader</button>
          <button className="btn" disabled={!!progress} onClick={() => run('cloud')}><Cloud size={16} /> Run cloud reader</button>
          {progress && (
            <div className="stack" style={{ gap: 6 }} aria-live="polite">
              <span className="small">{progress.label}: {progress.done} of {progress.total}</span>
              <Track value={progress.done} total={progress.total} kind={progress.label.startsWith('Laptop') ? 'laptop' : 'cloud'} />
              <span className="tiny faint">Keep this tab open. You can use other windows.</span>
            </div>
          )}
          {err && <div className="notice">{err}</div>}
          {results.length > 0 && (
            <button className="btn" onClick={() => downloadText(`qualpair-eval-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ dataset: 'le-foll-2025', userAgent: navigator.userAgent, results }, null, 2), 'application/json')}><Download size={16} /> Download results</button>
          )}
        </aside>
      </div>
    </div>
  );
}
