import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Logo } from './Logo';
import { Nav } from './Nav';
import { ErrorBoundary, isStaleBuild } from './ErrorBoundary';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { LandingPage } from '../features/landing/LandingPage';
import { ConfirmHost } from './Confirm';

/**
 * Load a page's code. If the file is gone because a new version was deployed while the tab was open,
 * reload once to pick up the new version (guarded so it can't loop).
 */
function page<T>(load: () => Promise<T>) {
  return lazy(() =>
    load().then(
      (m) => m as T & { default: React.ComponentType },
      (e) => {
        const key = 'qp-reloaded-for-update';
        let last = 0;
        try { last = Number(sessionStorage.getItem(key) ?? 0); } catch { /* storage blocked */ }
        if (isStaleBuild(e) && Date.now() - last > 30_000) {
          try { sessionStorage.setItem(key, String(Date.now())); } catch { /* storage blocked */ }
          location.reload();
          return new Promise<never>(() => {});
        }
        throw e;
      },
    ),
  );
}

const Overview = page(() => import('../features/overview/OverviewPage'));
const Interviews = page(() => import('../features/interviews/InterviewsPage'));
const Codebook = page(() => import('../features/codebook/CodebookPage'));
const Sample = page(() => import('../features/sample/SamplePage'));
const Laptop = page(() => import('../features/laptop/LaptopPage'));
const Access = page(() => import('../features/access/AccessPage'));
const Cloud = page(() => import('../features/cloud/CloudPage'));
const Agreement = page(() => import('../features/agreement/AgreementPage'));
const CodeDetail = page(() => import('../features/agreement/CodeDetailPage'));
const Review = page(() => import('../features/review/ReviewPage'));
const Report = page(() => import('../features/report/ReportPage'));
const Activity = page(() => import('../features/activity/ActivityPage'));
const Eval = page(() => import('../features/eval/EvalPage'));

function ProjectLayout() {
  // In narrow windows the study menu becomes a drawer behind a Menu button.
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenu(false), [pathname]);
  return (
    <div className={menu ? 'shell menu-open' : 'shell'}>
      <div className="mobile-bar">
        <Link to="/" aria-label="QualPair home page" style={{ textDecoration: 'none' }}><Logo size={24} fontSize={17} /></Link>
        <button className="btn small" aria-expanded={menu} aria-controls="study-nav" onClick={() => setMenu((m) => !m)}>{menu ? <X size={16} /> : <Menu size={16} />} Menu</button>
      </div>
      {menu && <div className="menu-backdrop" onClick={() => setMenu(false)} aria-hidden="true" />}
      <Nav />
      <main className="main">
        <ErrorBoundary key={pathname} home={pathname.split('/').slice(0, 3).join('/')}>
          <Suspense fallback={<div className="empty">Loading…</div>}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ConfirmHost />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/studies" element={<ProjectsPage />} />
        <Route path="/eval" element={<Suspense fallback={null}><Eval /></Suspense>} />
        <Route path="/p/:pid" element={<ProjectLayout />}>
          <Route index element={<Overview />} />
          <Route path="interviews" element={<Interviews />} />
          <Route path="codebook" element={<Codebook />} />
          <Route path="sample" element={<Sample />} />
          <Route path="laptop" element={<Laptop />} />
          <Route path="access" element={<Access />} />
          <Route path="cloud" element={<Cloud />} />
          <Route path="agreement" element={<Agreement />} />
          <Route path="agreement/:codeId" element={<CodeDetail />} />
          <Route path="review" element={<Review />} />
          <Route path="report" element={<Report />} />
          <Route path="activity" element={<Activity />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
