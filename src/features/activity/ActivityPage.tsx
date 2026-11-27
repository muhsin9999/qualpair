import { useLiveQuery } from 'dexie-react-hooks';
import { Fragment, useState } from 'react';
import { Cloud, Laptop } from 'lucide-react';
import { db } from '../../db/db';
import { usePid } from '../../app/hooks';
import { Empty, PageHead } from '../../app/ui';

const TASKS: Record<string, string> = {
  'code-segment': 'Coded a paragraph',
  'suggest-deid': 'Looked for names and places',
  'second-read': 'Coded approved access copies',
  'draft-codebook': 'Drafted codes from the research question',
  'suggest-definition': 'Suggested a clearer definition',
  'warm-up': 'Loaded the model',
};

export default function ActivityPage() {
  const pid = usePid();
  const rows = useLiveQuery(() => db.ledger.where('projectId').equals(pid).reverse().sortBy('at'), [pid]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [where, setWhere] = useState<'all' | 'in_cloud' | 'on_device'>('all');
  if (!rows) return null;
  const cloud = rows.filter((r) => r.where === 'in_cloud');
  const shown = rows.filter((r) => where === 'all' || r.where === where).slice(0, 300);
  return (
    <>
      <PageHead title="AI activity" sub="Every call to either reader, newest first. On-device calls store no text; cloud calls keep the exact text sent." />
      <div className="work col">
        <div className="row" style={{ gap: 12 }}>
          <div className="card pad grow"><div className="row laptop" style={{ gap: 8 }}><Laptop size={16} /><strong style={{ fontSize: 22 }}>{rows.length - cloud.length}</strong></div><div className="small muted">{rows.length - cloud.length === 1 ? 'call' : 'calls'} on this computer</div></div>
          <div className="card pad grow"><div className="row cloud" style={{ gap: 8 }}><Cloud size={16} /><strong style={{ fontSize: 22 }}>{cloud.length}</strong></div><div className="small muted">{cloud.length === 1 ? 'call' : 'calls'} to the cloud · {(cloud.reduce((n, r) => n + r.bytesSent, 0) / 1024).toFixed(1)} KB sent</div></div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {(['all', 'on_device', 'in_cloud'] as const).map((w) => (
            <button key={w} className={`btn small${where === w ? ' primary' : ''}`} onClick={() => setWhere(w)}>{w === 'all' ? 'All' : w === 'on_device' ? 'Laptop' : 'Cloud'}</button>
          ))}
        </div>
        {!rows.length ? (
          <Empty>No AI calls yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table wide">
              <thead><tr><th>When</th><th>Where</th><th>What</th><th>Paragraphs</th><th>Sent</th><th /></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="small muted">{new Date(r.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                      <td>{r.where === 'on_device' ? <span className="pill laptop"><Laptop size={12} /> Laptop</span> : <span className="pill cloud"><Cloud size={12} /> Cloud</span>}</td>
                      <td className="small">{TASKS[r.task] ?? r.task}{!r.ok && <span className="attn"> · failed</span>}<div className="tiny faint">{r.model} · {r.promptVersion}</div></td>
                      <td className="small muted">{r.segmentCount || '—'}</td>
                      <td className="small muted">{r.where === 'on_device' ? 'nothing' : `${(r.bytesSent / 1024).toFixed(1)} KB`}</td>
                      <td>{r.payloadPreview && <button className="btn ghost small" onClick={() => setOpenId(openId === r.id ? null : r.id)}>{openId === r.id ? 'Hide' : 'Show text'}</button>}</td>
                    </tr>
                    {openId === r.id && (
                      <tr><td colSpan={6}><pre style={{ whiteSpace: 'pre-wrap', font: '12px/1.5 var(--mono)', background: 'var(--side)', padding: 14, borderRadius: 8, maxHeight: 360, overflow: 'auto', margin: 0 }}>{r.payloadPreview}</pre>{r.error && <div className="small attn">{r.error}</div>}</td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
