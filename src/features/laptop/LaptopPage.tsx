import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Download, Laptop, LoaderCircle, Pause, Play } from 'lucide-react';
import { usePid, useCodebook, useTranscripts } from '../../app/hooks';
import { studyStats } from '../../app/stats';
import { CodeChip, PageHead, Track } from '../../app/ui';
import { currentElapsed, eta, formatElapsed, isRunning, isWarmingUp, useRuns } from '../../app/runs';
import { getDeviceReader, setPracticeMode } from '../../ai/registry';
import type { DeviceStatus } from '../../ai/readers';

function ModelStatus({ status, onStatus }: { status: DeviceStatus | null; onStatus: (s: DeviceStatus) => void }) {
  const reader = getDeviceReader();
  const [progress, setProgress] = useState<number | null>(null);
  const [justReady, setJustReady] = useState(false);
  const [err, setErr] = useState('');
  if (!status || reader.isPractice) return null;
  if (status === 'available')
    return justReady ? (
      <div className="notice ok row" style={{ gap: 10 }} role="status"><CheckCircle2 size={18} /> Gemini Nano is ready on this computer. Press Start to code your interviews.</div>
    ) : null;
  async function download() {
    setErr('');
    setProgress(0);
    try {
      await reader.warmUp((f) => setProgress(f));
      setJustReady(true);
      onStatus('available');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setProgress(null);
    }
  }
  if (status === 'unsupported' || status === 'unavailable')
    return (
      <div className="card pad stack" style={{ borderColor: 'var(--attn-line)', background: 'var(--attn-tint)' }}>
        <strong>The laptop reader can’t run in this browser</strong>
        <span className="small muted">
          {status === 'unsupported'
            ? 'It needs desktop Chrome with the built-in model (Gemini Nano). Open QualPair in Chrome on a laptop or desktop.'
            : 'Chrome says the model is unavailable on this computer, usually because of disk space (about 22 GB free needed) or hardware. Check chrome://on-device-internals for the reason.'}
        </span>
        <span className="small">Your transcripts will <strong>not</strong> be sent to the cloud instead.</span>
        <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => { setPracticeMode(true); location.reload(); }}>Use practice readers (keyword rules, no AI)</button>
      </div>
    );
  const busy = progress !== null;
  return (
    <div className="card pad stack" style={{ gap: 10 }}>
      <strong>Step 1: download the laptop reader</strong>
      <span className="small muted">Chrome downloads Gemini Nano once (about 2 GB; needs about 22 GB free disk). After that it works offline. You can keep using the rest of the app while it downloads.</span>
      {busy ? (
        <>
          <Track value={progress * 100} total={progress > 0 ? 100 : 0} kind="laptop" busy={progress === 0} />
          <span className="small laptop row" style={{ gap: 8 }} aria-live="polite">
            <LoaderCircle size={14} className="spin" /> {progress > 0 ? `Downloading… ${Math.round(progress * 100)}%` : 'Starting the download… this can take a few minutes.'}
          </span>
        </>
      ) : (
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={download}><Download size={16} /> {status === 'downloading' ? 'Continue the download' : 'Download (about 2 GB)'}</button>
      )}
      {err && <span className="small attn">The download stopped: {err}</span>}
    </div>
  );
}

export default function LaptopPage() {
  const pid = usePid();
  const book = useCodebook(pid);
  const transcripts = useTranscripts(pid);
  const s = useLiveQuery(() => studyStats(pid), [pid]);
  const run = useRuns((r) => r.runs.laptop);
  const start = useRuns((r) => r.start);
  const stop = useRuns((r) => r.stop);
  const [, force] = useState(0);
  const reader = getDeviceReader();
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  useEffect(() => {
    void reader.status().then(setStatus);
  }, [reader]);
  const canStart = reader.isPractice || status === 'available';
  const running = isRunning(run) && run?.pid === pid;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!s) return null;
  const done = running ? run!.progress.done : s.laptopDone;
  const total = s.codable;
  const currentTranscript = transcripts?.find((t) => (s.perTranscript.get(t.id)?.laptop ?? 0) < (s.perTranscript.get(t.id)?.codable ?? 0));
  const tIndex = currentTranscript && transcripts ? transcripts.indexOf(currentTranscript) + 1 : 0;
  const warming = running && isWarmingUp(run);
  const elapsed = formatElapsed(currentElapsed(run));
  let title = canStart ? 'Ready to code' : status === null ? 'Checking this computer…' : 'Waiting for the model';
  let sub = canStart ? 'Each finished paragraph is saved, so you can pause any time.' : status === 'downloadable' || status === 'downloading' ? 'Download Gemini Nano in the panel on the right first. Then press Start.' : 'The laptop reader needs Gemini Nano in Chrome.';
  if (done >= total && total) title = 'All paragraphs coded';
  else if (warming) {
    title = reader.isPractice ? 'Starting' : 'Loading Gemini Nano';
    if (!reader.isPractice) sub = 'The first paragraph takes about a minute while the model loads. After that, about 5–20 seconds each, depending on the computer.';
  } else if (running) {
    title = `Coding interview ${tIndex} of ${transcripts?.length ?? 0}`;
    sub = `Reading paragraph ${(done + 1).toLocaleString()} · ${elapsed}. You can keep working elsewhere in the app.`;
  }

  return (
    <>
      <PageHead title="Laptop reader" sub={reader.isPractice ? reader.modelName : 'Gemini Nano, running on this computer'} />
      <div className="work lp">
        <div className="stack grow" style={{ gap: 16, minWidth: 0 }}>
        {!book ? (
          <div className="card empty">Write your codebook first.</div>
        ) : (
          <div className="paper stack" style={{ padding: '26px 30px', gap: 18 }}>
            <div className="row">
              <span style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--laptop-tint)', display: 'grid', placeItems: 'center' }}><Laptop size={22} color="var(--laptop)" /></span>
              <div className="spacer">
                <div className="row" style={{ gap: 10, fontSize: 22, fontWeight: 800 }}>
                  {running && <LoaderCircle size={20} color="var(--laptop)" className="spin" aria-hidden />}
                  {title}
                  {warming && <span className="laptop" style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{elapsed}</span>}
                </div>
                <div className="small muted" aria-live="polite">{sub}</div>
              </div>
              {running ? (
                <button className="btn" onClick={() => stop('laptop')}><Pause size={16} /> Pause</button>
              ) : done < total ? (
                <button className="btn primary" disabled={!canStart} onClick={() => start(pid, 'laptop')}><Play size={16} /> {done ? 'Resume' : 'Start'}</button>
              ) : null}
            </div>
            <div className="row" style={{ alignItems: 'baseline' }}>
              <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{done.toLocaleString()}</span>
              <span className="muted spacer">of {total.toLocaleString()} paragraphs</span>
              {running && <strong className="laptop">{warming ? '' : eta(run) || 'working out time left…'}</strong>}
            </div>
            {warming ? <Track value={0} total={0} kind="laptop" busy /> : <Track value={done} total={total} kind="laptop" />}
            {run?.error && <div className="notice" role="alert"><strong>The laptop reader stopped.</strong> {run.error}</div>}
          </div>
        )}
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {transcripts?.map((t) => {
                const p = s.perTranscript.get(t.id);
                if (!p) return null;
                const full = p.codable > 0 && p.laptop >= p.codable;
                const active = running && t.id === currentTranscript?.id;
                return (
                  <tr key={t.id}>
                    <td style={{ width: 30 }}>{full ? <CheckCircle2 size={16} color="var(--laptop)" /> : active ? <LoaderCircle size={16} color="var(--laptop)" className="spin" /> : <Circle size={16} color="var(--ink3)" />}</td>
                    <td style={{ width: 180, fontWeight: active ? 700 : 500 }}>{t.title}</td>
                    <td><Track value={p.laptop} total={p.codable} kind="laptop" /></td>
                    <td className="small faint" style={{ width: 130, textAlign: 'right', whiteSpace: 'nowrap' }}>{full ? `${p.codable} paragraphs` : `${p.laptop} / ${p.codable}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
        <aside className="stack lp-side">
          <ModelStatus status={status} onStatus={setStatus} />
          {running && run?.last && (
            <div className="card pad stack">
              <span className="label">Just coded</span>
              <div style={{ font: 'italic 15.5px/1.55 var(--read)' }}>“{run.last.text}”</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {run.last.codeIds.length ? run.last.codeIds.map((id) => { const c = book?.codes.find((x) => x.id === id); return c ? <CodeChip key={id} code={c} /> : null; }) : <span className="small faint">No codes</span>}
              </div>
            </div>
          )}
          <div className="card pad stack" style={{ gap: 12 }}>
            <strong>{reader.isPractice ? 'Practice reader' : 'What the laptop reader does'}</strong>
            <dl className="facts">
              {reader.isPractice ? (
                <><dt>Reads</dt><dd>Original transcripts</dd><dt>Method</dt><dd>Keyword rules, no AI</dd><dt>Sends</dt><dd>Nothing</dd></>
              ) : (
                <><dt>Reads</dt><dd>Original transcripts</dd><dt>Runs</dt><dd>On this computer</dd><dt>Sends</dt><dd>Nothing</dd><dt>Works offline</dt><dd>Yes</dd></>
              )}
            </dl>
            <span className="tiny faint">Each paragraph is coded on its own, with your code definitions. Its words never leave this browser.</span>
          </div>
        </aside>
      </div>
    </>
  );
}
