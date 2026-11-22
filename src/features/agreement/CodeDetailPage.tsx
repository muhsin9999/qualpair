import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Cloud, Laptop } from 'lucide-react';
import { db } from '../../db/db';
import { paraNo, usePid } from '../../app/hooks';
import { PageHead, ReaderDot } from '../../app/ui';
import { agreementByCode, codingIndex } from '../../services/results';
import { getSample } from '../../services/coding';
import { formatKappa, kappaBand } from '../../domain/stats/agreement';
import type { Segment } from '../../types';

export default function CodeDetailPage() {
  const pid = usePid();
  const codeId = useParams().codeId ?? '';
  const [filter, setFilter] = useState<'disagree' | 'agree' | 'all'>('disagree');
  const data = useLiveQuery(async () => {
    const ag = await agreementByCode(pid);
    const c = ag.codes.find((x) => x.code.id === codeId);
    const sample = await getSample(pid);
    const { index } = await codingIndex(pid);
    const segs = (await db.segments.bulkGet(sample?.segmentIds ?? [])).filter((s): s is Segment => !!s && !!index.get(s.id)?.human);
    const titles = new Map((await db.transcripts.where('projectId').equals(pid).toArray()).map((t) => [t.id, t.title]));
    const rows = segs.map((s) => {
      const e = index.get(s.id)!;
      return { s, you: !!e.human?.get(codeId), lap: e.device ? !!e.device.get(codeId) : null, cld: e.cloud ? !!e.cloud.get(codeId) : null, title: titles.get(s.transcriptId) ?? '' };
    });
    return { c, rows };
  }, [pid, codeId]);
  if (!data?.c) return null;
  const { c, rows } = data;
  const disagree = (r: (typeof rows)[number]) => (r.lap !== null && r.lap !== r.you) || (r.cld !== null && r.cld !== r.you);
  const relevant = rows.filter((r) => r.you || r.lap || r.cld);
  const shown = rows.filter((r) => (filter === 'all' ? r.you || r.lap || r.cld : filter === 'disagree' ? disagree(r) : !disagree(r) && (r.you || r.lap || r.cld)));
  const split = (k: 'lap' | 'cld') => {
    const rs = rows.filter((r) => r[k] !== null);
    return { match: rs.filter((r) => r[k] === r.you && r.you).length, onlyReader: rs.filter((r) => r[k] && !r.you).length, onlyYou: rs.filter((r) => !r[k] && r.you).length };
  };

  return (
    <>
      <PageHead title={c.code.name} sub={<><Link to=".." relative="path">Agreement</Link> › one code, paragraph by paragraph in your sample</>} />
      <div className="work col">
        <div className="row" style={{ gap: 14, alignItems: 'stretch' }}>
          {(['lap', 'cld'] as const).map((k) => {
            const r = k === 'lap' ? c.laptop : c.cloud;
            const sp = split(k);
            const color = k === 'lap' ? 'var(--laptop)' : 'var(--cloud)';
            return (
              <div key={k} className="card pad grow stack" style={{ gap: 8 }}>
                <div className="row">
                  {k === 'lap' ? <Laptop size={16} color={color} /> : <Cloud size={16} color={color} />}
                  <strong className="spacer">{k === 'lap' ? 'Laptop reader' : 'Cloud reader'}</strong>
                  <strong style={{ color }}>κ {formatKappa(r?.kappa ?? null)} · {kappaBand(r?.kappa ?? null)}</strong>
                </div>
                <div className="row small" style={{ gap: 16 }}>
                  <span className="muted">{sp.match} match you</span>
                  <span style={{ color }}>{sp.onlyReader} only the {k === 'lap' ? 'laptop' : 'cloud'}</span>
                  <span>{sp.onlyYou} only you</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {([['disagree', `Disagree · ${rows.filter(disagree).length}`], ['agree', `Agree · ${relevant.filter((r) => !disagree(r)).length}`], ['all', `All · ${relevant.length}`]] as const).map(([k, l]) => (
            <button key={k} className={`btn small${filter === k ? ' primary' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Paragraph</th><th style={{ textAlign: 'center' }}>You</th><th style={{ textAlign: 'center', color: 'var(--laptop)' }}>Laptop</th><th style={{ textAlign: 'center', color: 'var(--cloud)' }}>Cloud</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.s.id} style={{ background: disagree(r) ? '#fdf8ef' : undefined }}>
                  <td>
                    <div className="tiny faint">{r.title} · paragraph {paraNo(r.s.index)}</div>
                    <div style={{ font: '15px/1.5 var(--read)' }}>{r.s.text.length > 320 ? `${r.s.text.slice(0, 320)}…` : r.s.text}</div>
                  </td>
                  <td style={{ textAlign: 'center', width: 70 }}><ReaderDot on={r.you} who="human" /></td>
                  <td style={{ textAlign: 'center', width: 70 }}>{r.lap === null ? <span className="faint">—</span> : <ReaderDot on={r.lap} who="device" />}</td>
                  <td style={{ textAlign: 'center', width: 70 }}>{r.cld === null ? <span className="faint">—</span> : <ReaderDot on={r.cld} who="cloud" />}</td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={4} className="empty small">Nothing here.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="tiny faint">● applied the code · ○ did not · — not read yet</div>
      </div>
    </>
  );
}
