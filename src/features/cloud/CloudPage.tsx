import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { BookOpen, Cloud, EyeOff, FileCheck, Pause, Send, Text } from 'lucide-react';
import { db } from '../../db/db';
import { usePid, useCodebook, useTranscripts } from '../../app/hooks';
import { studyStats } from '../../app/stats';
import { PageHead, Track } from '../../app/ui';
import { eta, isRunning, useRuns } from '../../app/runs';
import { getCloudReader } from '../../ai/registry';
import { CloudTermsNotice } from './CloudTermsNotice';
import type { AccessCopy } from '../../types';

function Readable({ copy }: { copy: AccessCopy }) {
  const parts = copy.redactedText.split(/(\[[^\]]+\])/g);
  return <>{parts.map((p, i) => (/^\[[^\]]+\]$/.test(p) ? <span key={i} className="token">{p}</span> : p))}</>;
}

export default function CloudPage() {
  const pid = usePid();
  const book = useCodebook(pid);
  const transcripts = useTranscripts(pid);
  const s = useLiveQuery(() => studyStats(pid), [pid]);
  const approvals = useLiveQuery(async () => new Set((await db.approvals.where('projectId').equals(pid).toArray()).map((a) => a.transcriptId)), [pid]);
  const approvedTs = transcripts?.filter((t) => approvals?.has(t.id)) ?? [];
  const [tid, setTid] = useState<string>('');
  const shownId = tid || approvedTs[0]?.id;
  const copies = useLiveQuery(async () => {
    if (!shownId) return [];
    const segs = await db.segments.where('transcriptId').equals(shownId).sortBy('index');
    const map = new Map((await db.accessCopies.where('transcriptId').equals(shownId).toArray()).map((c) => [c.segmentId, c]));
    return segs.filter((x) => !x.isInterviewer).map((x) => map.get(x.id)).filter((c): c is AccessCopy => !!c);
  }, [shownId]);
  const hiddenWords = useLiveQuery(async () => {
    const all = await db.accessCopies.where('projectId').equals(pid).toArray();
    return all.filter((c) => approvals?.has(c.transcriptId)).reduce((n, c) => n + c.redactions.filter((r) => r.status === 'hidden').length, 0);
  }, [pid, approvals]);
  const run = useRuns((r) => r.runs.cloud);
  const start = useRuns((r) => r.start);
  const stop = useRuns((r) => r.stop);
  const reader = getCloudReader();
  if (!s || !transcripts) return null;
  const running = isRunning(run) && run?.pid === pid;
  const approvedParas = approvedTs.reduce((n, t) => n + (s.perTranscript.get(t.id)?.codable ?? 0), 0);
  const done = running ? run!.progress.done : s.cloudDone;

  return (
    <>
      <PageHead title="Cloud reader" sub={reader.isPractice ? reader.modelName : 'Gemini, through Firebase'} />
      <div className="work">
        <div className="grow stack" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 12 }}>
            {[
              [FileCheck, `${approvedTs.length} of ${transcripts.length}`, 'access copies approved'],
              [Text, approvedParas.toLocaleString(), 'paragraphs'],
              [EyeOff, (hiddenWords ?? 0).toLocaleString(), 'words hidden'],
            ].map(([Icon, n, l]) => {
              const I = Icon as typeof Cloud;
              return (
                <div key={l as string} className="card pad grow stack" style={{ gap: 2 }}>
                  <span className="row" style={{ gap: 8 }}><I size={15} color="var(--cloud)" /><strong style={{ fontSize: 22 }}>{n as string}</strong></span>
                  <span className="small muted">{l as string}</span>
                </div>
              );
            })}
          </div>
          <div className="paper">
            <div className="row" style={{ padding: '14px 22px', borderBottom: '1px solid var(--rule)' }}>
              <Cloud size={16} color="var(--cloud)" />
              <strong className="cloud spacer">What the cloud reader will see</strong>
              {approvedTs.length > 0 && (
                <select className="select" style={{ width: 'auto' }} value={shownId} onChange={(e) => setTid(e.target.value)}>
                  {approvedTs.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              )}
            </div>
            <div className="stack" style={{ padding: '18px 28px', gap: 14, maxHeight: 560, overflow: 'auto' }}>
              {!approvedTs.length && <div className="empty small">No access copies approved yet. Approve them on the Access copies page.</div>}
              {copies?.map((c) => (
                <div key={c.segmentId} className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
                  <span className="speaker-chip p">{transcripts.find((t) => t.id === c.transcriptId) ? 'P' : ''}</span>
                  <div style={{ font: '16px/1.7 var(--read)' }}><Readable copy={c} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="stack" style={{ width: 360, flex: 'none', gap: 12 }}>
          <div className="card lift pad stack" style={{ gap: 14 }}>
            <div className="row">
              <span style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--cloud-tint)', display: 'grid', placeItems: 'center' }}><Cloud size={20} color="var(--cloud)" /></span>
              <strong style={{ fontSize: 17 }}>Send to the cloud reader</strong>
            </div>
            {!reader.isPractice && <CloudTermsNotice />}
            <span className="row small muted"><BookOpen size={14} /> Also sent: your {book?.codes.length ?? 0} code definitions</span>
            {running ? (
              <>
                <div className="row" style={{ alignItems: 'baseline' }}><strong style={{ fontSize: 28 }}>{done}</strong><span className="muted spacer">of {run!.progress.total} paragraphs</span><span className="small cloud">{eta(run)}</span></div>
                <Track value={done} total={run!.progress.total} kind="cloud" />
                <button className="btn" onClick={() => stop('cloud')}><Pause size={16} /> Pause</button>
              </>
            ) : (
              <>
                {s.cloudDone > 0 && <><span className="small muted">{s.cloudDone} of {s.codable} paragraphs coded</span><Track value={s.cloudDone} total={s.codable} kind="cloud" /></>}
                <button className="btn primary" disabled={!approvedTs.length || !book || s.cloudDone >= approvedParas} onClick={() => start(pid, 'cloud')}>
                  <Send size={16} /> {s.cloudDone >= approvedParas && approvedParas ? 'All approved copies coded' : `Send ${approvedTs.length} access cop${approvedTs.length === 1 ? 'y' : 'ies'}`}
                </button>
              </>
            )}
            {approvedTs.length < transcripts.length && <span className="tiny faint">Only approved copies are sent. {transcripts.length - approvedTs.length} still need approval.</span>}
            {run?.error && <div className="notice small">The cloud reader stopped: {run.error}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
