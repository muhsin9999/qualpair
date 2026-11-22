import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Cloud, EyeOff, Laptop, UserRound } from 'lucide-react';
import { usePid, useProject, useTranscripts } from '../../app/hooks';
import { studyStats } from '../../app/stats';
import { PageHead } from '../../app/ui';
import { agreementByCode } from '../../services/results';
import { kappaBand } from '../../domain/stats/agreement';

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export default function OverviewPage() {
  const pid = usePid();
  const project = useProject(pid);
  const transcripts = useTranscripts(pid);
  const s = useLiveQuery(() => studyStats(pid), [pid]);
  const ag = useLiveQuery(() => agreementByCode(pid), [pid]);
  if (!project || !s) return null;
  const kl = median((ag?.codes ?? []).map((c) => c.laptop?.kappa).filter((k): k is number => typeof k === 'number'));
  const kc = median((ag?.codes ?? []).map((c) => c.cloud?.kappa).filter((k): k is number => typeof k === 'number'));

  let next: { text: string; to: string; cta: string };
  if (!s.interviews) next = { text: 'Next: import your interview transcripts', to: 'interviews', cta: 'Import' };
  else if (!s.codes) next = { text: 'Next: write or draft your codebook', to: 'codebook', cta: 'Open codebook' };
  else if (!s.sampleSize || s.sampleDone < s.sampleSize) next = { text: `Next: code your sample yourself (${s.sampleDone} of ${s.sampleSize || '…'} paragraphs done)`, to: 'sample', cta: 'Code your sample' };
  else if (s.laptopDone < s.codable) next = { text: `Next: let the laptop reader code ${s.codable - s.laptopDone} paragraphs`, to: 'laptop', cta: 'Open laptop reader' };
  else if (s.approved < s.interviews) next = { text: `Next: approve ${s.interviews - s.approved} access copies`, to: 'access', cta: 'Review access copies' };
  else if (s.cloudDone < s.codable) next = { text: 'Next: send the approved access copies to the cloud reader', to: 'cloud', cta: 'Open cloud reader' };
  else if (s.open) next = { text: `Next: decide ${s.open} places where the readers disagree`, to: 'review', cta: 'Start reviewing' };
  else next = { text: 'All disagreements decided. Build your report.', to: 'report', cta: 'Open report' };

  const readerCard = (kind: 'laptop' | 'cloud', done: number) => (
    <div className="card lift pad stack grow" style={{ gap: 12 }}>
      <div className="row">
        <span style={{ width: 36, height: 36, borderRadius: 18, background: `var(--${kind}-tint)`, display: 'grid', placeItems: 'center' }}>
          {kind === 'laptop' ? <Laptop size={18} color="var(--laptop)" /> : <Cloud size={18} color="var(--cloud)" />}
        </span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{kind === 'laptop' ? 'Laptop reader' : 'Cloud reader'}</div>
          <div className="small faint">{kind === 'laptop' ? 'Gemini Nano, on this computer' : 'Gemini, through Firebase'}</div>
        </div>
      </div>
      <div className="row" style={{ alignItems: 'baseline' }}>
        <span className="big" style={{ color: `var(--${kind})` }}>{done.toLocaleString()}</span>
        <span className="muted">of {s.codable.toLocaleString()} paragraphs coded</span>
      </div>
      <div className="small muted">{kind === 'laptop' ? 'Reads the original transcripts' : 'Reads only the approved access copies'}</div>
    </div>
  );

  return (
    <>
      <PageHead title={project.name} sub={project.researchQuestion || undefined} />
      <div className="work col">
        <div className="row" style={{ gap: 0, alignItems: 'stretch' }}>
          {readerCard('laptop', s.laptopDone)}
          <div className="stack" style={{ width: 300, padding: '0 18px', gap: 10 }}>
            <div className="stack" style={{ background: 'var(--ink)', color: '#fff', borderRadius: 12, padding: 18, alignItems: 'center', gap: 6 }}>
              <span style={{ width: 36, height: 36, borderRadius: 18, background: '#ffffff1f', display: 'grid', placeItems: 'center' }}><UserRound size={18} /></span>
              <strong style={{ fontSize: 16 }}>You</strong>
              <span className="small" style={{ opacity: 0.7 }}>{s.sampleDone} paragraphs coded by hand</span>
            </div>
            <div className="row" style={{ gap: 10 }}>
              {[['laptop', kl], ['cloud', kc]].map(([k, v]) => (
                <div key={k as string} className="stack grow" style={{ background: `var(--${k}-tint)`, borderRadius: 10, padding: '10px 8px', alignItems: 'center', gap: 2, color: `var(--${k})` }}>
                  <strong style={{ fontSize: 20 }}>{v === null ? '—' : `κ ${(v as number).toFixed(2)}`}</strong>
                  <span className="tiny" style={{ fontWeight: 600 }}>{k === 'laptop' ? 'Laptop' : 'Cloud'}{v !== null ? ` · ${kappaBand(v as number)}` : ''}</span>
                </div>
              ))}
            </div>
            <div className="tiny faint" style={{ textAlign: 'center' }}>Median agreement with you, across codes</div>
          </div>
          {readerCard('cloud', s.cloudDone)}
        </div>

        <div className="next-bar">
          <span className="dot" style={{ background: 'var(--attn)' }} />
          <span className="spacer">{next.text}</span>
          <Link className="btn primary" to={next.to}>{next.cta} <ArrowRight size={16} /></Link>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Interview</th>
                <th>Speakers</th>
                <th><span className="row" style={{ gap: 6, color: 'var(--ink)' }}><UserRound size={13} /> Your sample</span></th>
                <th><span className="row laptop" style={{ gap: 6 }}><Laptop size={13} /> Laptop reader</span></th>
                <th><span className="row" style={{ gap: 6 }}><EyeOff size={13} /> Access copy</span></th>
                <th><span className="row cloud" style={{ gap: 6 }}><Cloud size={13} /> Cloud reader</span></th>
                <th>To decide</th>
              </tr>
            </thead>
            <tbody>
              {transcripts?.map((t) => {
                const p = s.perTranscript.get(t.id);
                if (!p) return null;
                const cell = (done: number, total: number, color: string) =>
                  total && done >= total ? <Check size={15} color={color} /> : done ? <span className="small muted">{done}/{total}</span> : <span className="faint">—</span>;
                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}><Link to={`interviews?t=${t.id}`} style={{ textDecoration: 'none' }}>{t.title}</Link></td>
                    <td>{p.speakersSet ? <Check size={15} color="var(--ink3)" /> : <span className="pill attn">Choose</span>}</td>
                    <td className="small muted">{p.sample ? `${p.sample} paragraph${p.sample === 1 ? '' : 's'}` : <span className="faint">—</span>}</td>
                    <td>{cell(p.laptop, p.codable, 'var(--laptop)')}</td>
                    <td>{p.approved ? <Check size={15} color="var(--ink3)" /> : <span className="faint">—</span>}</td>
                    <td>{cell(p.cloud, p.codable, 'var(--cloud)')}</td>
                    <td>{p.open ? <span className="pill attn">{p.open}</span> : <span className="faint">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
