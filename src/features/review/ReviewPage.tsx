import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCircle2, Circle, Cloud, Laptop, X } from 'lucide-react';
import { db } from '../../db/db';
import { codeColor, paraNo, usePid } from '../../app/hooks';
import { Empty, PageHead, Track } from '../../app/ui';
import { decide, disagreements, type Disagreement } from '../../services/results';
import type { DecisionOutcome } from '../../types';

function Highlight({ text, quote }: { text: string; quote?: string }) {
  if (!quote) return <>{text}</>;
  const i = text.indexOf(quote);
  if (i < 0) return <>{text}</>;
  return (<>{text.slice(0, i)}<mark className="q">{quote}</mark>{text.slice(i + quote.length)}</>);
}

export default function ReviewPage() {
  const pid = usePid();
  const all = useLiveQuery(() => disagreements(pid), [pid]);
  const titles = useLiveQuery(async () => new Map((await db.transcripts.where('projectId').equals(pid).toArray()).map((t) => [t.id, t.title])), [pid]);
  const [cursor, setCursor] = useState(0);
  const [memo, setMemo] = useState('');
  const [memoOpen, setMemoOpen] = useState(false);
  const open = useMemo(() => all?.filter((d) => !d.decision) ?? [], [all]);
  const item: Disagreement | undefined = open[Math.min(cursor, Math.max(0, open.length - 1))];
  const context = useLiveQuery(async () => {
    if (!item) return [];
    const s = item.segment;
    return db.segments.where('[transcriptId+index]').between([s.transcriptId, s.index - 2], [s.transcriptId, s.index + 1], true, true).toArray();
  }, [item?.segment.id]);

  const act = useCallback(
    async (outcome: DecisionOutcome) => {
      if (!item) return;
      await decide(pid, item.segment.id, item.code.id, outcome, memo);
      setMemo('');
      setMemoOpen(false);
    },
    [item, pid, memo],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return;
      if (e.key === 'a') void act('applied');
      else if (e.key === 'r') void act('rejected');
      else if (e.key === 's') setCursor((c) => c + 1);
      else if (e.key === 'j') setCursor((c) => Math.min(open.length - 1, c + 1));
      else if (e.key === 'k') setCursor((c) => Math.max(0, c - 1));
      else if (e.key === 'm') { e.preventDefault(); setMemoOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, open.length]);

  if (!all) return null;
  const total = all.length;
  const decided = total - open.length;
  if (!total)
    return (<><PageHead title="Disagreements" /><div className="work col"><Empty action={<Link className="btn primary" to="../cloud">Open the cloud reader</Link>}>No disagreements yet. They appear once both readers have coded the same paragraphs.</Empty></div></>);

  return (
    <>
      <PageHead title="Disagreements" sub={item ? `${titles?.get(item.segment.transcriptId) ?? ''}` : undefined}>
        <span className="row small" style={{ gap: 14 }}>
          <span className="row" style={{ gap: 5 }}><span className="rdot on" style={{ color: 'var(--ink)', width: 10, height: 10 }} /> You</span>
          <span className="row laptop" style={{ gap: 5 }}><span className="rdot on" style={{ width: 10, height: 10 }} /> Laptop</span>
          <span className="row cloud" style={{ gap: 5 }}><span className="rdot on" style={{ width: 10, height: 10 }} /> Cloud</span>
        </span>
      </PageHead>
      <div className="work">
        {!item ? (
          <div className="grow"><Empty action={<Link className="btn primary" to="../report">Build the report</Link>}><CheckCircle2 size={22} /> <div>All {total} disagreements decided.</div></Empty></div>
        ) : (
          <div className="paper grow doc">
            <h2>{titles?.get(item.segment.transcriptId)}</h2>
            {context?.map((s) => {
              const focus = s.id === item.segment.id;
              return (
                <div key={s.id} className={`para${focus ? '' : ' ctx'}${s.isInterviewer ? ' iv' : ''}`} style={focus ? { boxShadow: 'inset 4px 0 0 var(--attn)' } : undefined}>
                  <span className="ln" style={focus ? { color: 'var(--attn)' } : undefined}>{paraNo(s.index)}</span>
                  <div>
                    <div className="who">{s.isInterviewer ? 'Interviewer' : 'Participant'}</div>
                    <div className="tx" style={focus ? { fontSize: 18.5, lineHeight: 1.75 } : undefined}>
                      {focus ? <Highlight text={s.text} quote={item.laptopEvidence ?? item.cloudEvidence} /> : s.text}
                    </div>
                  </div>
                  {focus ? (
                    <div className="stack" style={{ width: 150, gap: 6, paddingTop: 22 }}>
                      <span className="row tiny" style={{ fontWeight: 700 }}><span className="cbar" style={{ background: codeColor(item.code), height: 12 }} />{item.code.name}</span>
                      <span className="row" style={{ gap: 6, paddingLeft: 9 }}>
                        <span className="rdot pending" />
                        <span className={`rdot${item.laptop ? ' on' : ''}`} style={{ color: 'var(--laptop)' }} />
                        <span className={`rdot${item.cloud ? ' on' : ''}`} style={{ color: 'var(--cloud)' }} />
                      </span>
                    </div>
                  ) : <span />}
                </div>
              );
            })}
          </div>
        )}

        <div className="stack" style={{ width: 340, flex: 'none', gap: 14 }}>
          <div className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ alignItems: 'baseline' }}><span className="big">{open.length}</span><span className="muted spacer">decisions left</span><span className="small faint">{decided} of {total} done</span></div>
            <Track value={decided} total={total} />
          </div>
          {item && (
            <div className="card lift" style={{ overflow: 'hidden' }}>
              <div className="stack" style={{ padding: '16px 18px', gap: 8 }}>
                <span className="tiny attn" style={{ fontWeight: 700 }}>The two readers disagree</span>
                <strong style={{ fontSize: 19 }}>Is this “{item.code.name}”?</strong>
                <span className="small muted">{item.code.definition}</span>
              </div>
              <div style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '4px 18px' }}>
                {([['Laptop reader', item.laptop, 'var(--laptop)', 'var(--laptop-tint)', Laptop, item.laptopEvidence], ['Cloud reader', item.cloud, 'var(--cloud)', 'var(--cloud-tint)', Cloud, item.cloudEvidence]] as const).map(([name, yes, col, tint, Icon, ev]) => (
                  <div key={name} className="row" style={{ padding: '9px 0', alignItems: 'flex-start' }}>
                    <span style={{ width: 28, height: 28, borderRadius: 14, background: tint, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon size={15} color={col} /></span>
                    <div className="spacer">
                      <div>{name}</div>
                      {yes && ev && <div className="tiny faint" style={{ fontStyle: 'italic' }}>“{ev}”</div>}
                    </div>
                    <span className="row" style={{ gap: 5, color: yes ? col : 'var(--ink3)', fontWeight: yes ? 700 : 400 }}>{yes ? <CheckCircle2 size={16} /> : <Circle size={16} />} {yes ? 'Yes' : 'No'}</span>
                  </div>
                ))}
              </div>
              <div className="stack" style={{ padding: '14px 18px', gap: 10 }}>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary grow" onClick={() => act('applied')}><Check size={16} /> Yes, apply <span className="kbd">A</span></button>
                  <button className="btn grow" onClick={() => act('rejected')}><X size={16} /> No <span className="kbd">R</span></button>
                </div>
                {memoOpen ? (
                  <textarea className="textarea" autoFocus placeholder="Why? (saved with your decision)" value={memo} onChange={(e) => setMemo(e.target.value)} />
                ) : null}
                <div className="row small" style={{ justifyContent: 'center', gap: 16 }}>
                  <button className="btn ghost small" onClick={() => setCursor((c) => c + 1)}>Skip <span className="kbd">S</span></button>
                  <button className="btn ghost small" onClick={() => setMemoOpen(true)}>Add memo <span className="kbd">M</span></button>
                  <Link className="btn ghost small" to="../codebook">Edit code</Link>
                </div>
              </div>
            </div>
          )}
          {open.length > 1 && (
            <div className="stack" style={{ gap: 2 }}>
              <div className="row"><span className="label spacer">Up next</span><span className="kbd">J</span><span className="kbd">K</span></div>
              {open.slice(cursor + 1, cursor + 4).map((d) => (
                <div key={`${d.segment.id}:${d.code.id}`} className="row" style={{ padding: '8px 0', borderTop: '1px solid var(--rule)', alignItems: 'flex-start' }}>
                  <div className="spacer" style={{ minWidth: 0 }}>
                    <div className="small" style={{ fontWeight: 600 }}>{d.code.name}</div>
                    <div className="tiny muted" style={{ fontFamily: 'var(--read)', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>“{d.segment.text.slice(0, 70)}…”</div>
                  </div>
                  <span className="tiny faint">para {paraNo(d.segment.index)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
