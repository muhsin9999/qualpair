import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Nav } from './Nav';
import { ErrorBoundary } from './ErrorBoundary';
import { ProjectsPage } from '../features/projects/ProjectsPage';

const Overview = lazy(() => import('../features/overview/OverviewPage'));
const Interviews = lazy(() => import('../features/interviews/InterviewsPage'));
const Codebook = lazy(() => import('../features/codebook/CodebookPage'));
const Sample = lazy(() => import('../features/sample/SamplePage'));
const Laptop = lazy(() => import('../features/laptop/LaptopPage'));
const Access = lazy(() => import('../features/access/AccessPage'));
const Cloud = lazy(() => import('../features/cloud/CloudPage'));
const Agreement = lazy(() => import('../features/agreement/AgreementPage'));
const CodeDetail = lazy(() => import('../features/agreement/CodeDetailPage'));
const Review = lazy(() => import('../features/review/ReviewPage'));
const Report = lazy(() => import('../features/report/ReportPage'));
const Activity = lazy(() => import('../features/activity/ActivityPage'));
const Eval = lazy(() => import('../features/eval/EvalPage'));

function ProjectLayout() {
  return (
    <div className="shell">
      <Nav />
      <main className="main">
        <ErrorBoundary>
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
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
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
