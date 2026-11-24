import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Activity, BookOpen, ChevronsUpDown, Cloud, EyeOff, Files, GitCompareArrows, LayoutDashboard, Laptop, Scale, FileChartColumn, UserRound,
} from 'lucide-react';
import { db } from '../db/db';
import { practiceMode } from '../ai/registry';
import { usePid, useProject } from './hooks';
import { studyStats } from './stats';
import { Logo } from './Logo';

function pct(done: number, total: number) {
  if (!total) return '';
  if (done >= total) return '✓';
  return `${Math.floor((done / total) * 100)}%`;
}

export function Nav() {
  const pid = usePid();
  const project = useProject(pid);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const s = useLiveQuery(() => studyStats(pid), [pid]);

  const item = (to: string, label: string, Icon: typeof Files, right?: string, rightClass = '', iconColor?: string) => (
    <NavLink to={to} end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
      <Icon size={16} color={iconColor ?? 'var(--ink2)'} />
      <span>{label}</span>
      {right ? <span className={`r ${rightClass}`}>{right}</span> : null}
    </NavLink>
  );
  const base = `/p/${pid}`;
  const initials = (project?.name ?? '?').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

  return (
    <nav className="nav" aria-label="Study">
      <Link to="/studies" className="brand">
        <Logo size={22} fontSize={15} />
      </Link>
      <div style={{ position: 'relative' }}>
        <button className="switcher" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="ini">{initials}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <div className="nm">{project?.name ?? '…'}</div>
            <div className="mt">{s ? `${s.interviews} interviews` : ''}</div>
          </span>
          <ChevronsUpDown size={14} color="var(--ink3)" />
        </button>
        {open && (
          <div className="card lift" style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, marginTop: 4, padding: 6 }}>
            {projects?.map((p) => (
              <button key={p.id} className="nav-item" style={{ width: '100%', background: 'none', cursor: 'pointer' }} onClick={() => { setOpen(false); navigate(`/p/${p.id}`); }}>
                {p.name}
              </button>
            ))}
            <Link className="nav-item" to="/studies" onClick={() => setOpen(false)}>All studies…</Link>
          </div>
        )}
      </div>
      {practiceMode() && <div className="practice-flag" title="Readers use keyword rules, not AI">Practice readers on (no AI)</div>}
      <div style={{ height: 8 }} />
      {item(base, 'Overview', LayoutDashboard)}
      <div className="nav-group">PREPARE</div>
      {item(`${base}/interviews`, 'Interviews', Files, s ? String(s.interviews) : '')}
      {item(`${base}/codebook`, 'Codebook', BookOpen, s ? String(s.codes) : '')}
      <div className="nav-group">CODING</div>
      {item(`${base}/sample`, 'Your sample', UserRound, s && s.sampleSize && s.sampleDone < s.sampleSize ? `${s.sampleDone}/${s.sampleSize}` : '', '', 'var(--ink)')}
      {item(`${base}/laptop`, 'Laptop reader', Laptop, s ? pct(s.laptopDone, s.codable) : '', '', 'var(--laptop)')}
      {item(`${base}/access`, 'Access copies', EyeOff, s && s.interviews && s.approved < s.interviews ? `${s.approved}/${s.interviews}` : '')}
      {item(`${base}/cloud`, 'Cloud reader', Cloud, s ? pct(s.cloudDone, s.codable) : '', '', 'var(--cloud)')}
      <div className="nav-group">RESULTS</div>
      {item(`${base}/agreement`, 'Agreement', Scale)}
      {item(`${base}/review`, 'Disagreements', GitCompareArrows, s && s.open ? String(s.open) : '', 'attn')}
      {item(`${base}/report`, 'Report', FileChartColumn)}
      <div className="push" />
      {item(`${base}/activity`, 'AI activity', Activity, s ? String(s.ledger) : '')}
    </nav>
  );
}
