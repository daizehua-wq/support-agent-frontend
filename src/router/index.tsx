import { lazy, Suspense, type ReactNode } from 'react';
import { Spin } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from '../layout/MainLayout';
import HomePage from '../pages/Home';

const AnalyzePage = lazy(() => import('../pages/Analyze'));
const AssistantCenterPage = lazy(() => import('../pages/AssistantCenter'));
const DatabaseManagerPage = lazy(() => import('../pages/DatabaseManager'));
const ModelCenterPage = lazy(() => import('../pages/ModelCenter'));
const SessionDetailPage = lazy(() => import('../pages/Sessopns/Datail'));
const ScriptPage = lazy(() => import('../pages/Script'));
const SearchPage = lazy(() => import('../pages/Search'));
const SettingsPage = lazy(() => import('../pages/Settings'));
const WorkbenchPage = lazy(() => import('../pages/Workbench'));

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: '40vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Spin size="large" tip="页面加载中..." />
    </div>
  );
}

function renderLazyPage(page: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{page}</Suspense>;
}

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="assistant-center" element={renderLazyPage(<AssistantCenterPage />)} />
        <Route path="sessions/:id" element={renderLazyPage(<SessionDetailPage />)} />
        <Route path="workbench" element={renderLazyPage(<WorkbenchPage />)} />
        <Route path="judge" element={renderLazyPage(<AnalyzePage />)} />
        <Route path="retrieve" element={renderLazyPage(<SearchPage />)} />
        <Route path="compose" element={renderLazyPage(<ScriptPage />)} />
        <Route path="analyze" element={renderLazyPage(<AnalyzePage />)} />
        <Route path="search" element={renderLazyPage(<SearchPage />)} />
        <Route path="script" element={renderLazyPage(<ScriptPage />)} />
        <Route path="settings" element={renderLazyPage(<SettingsPage />)} />
        <Route path="model-center" element={renderLazyPage(<ModelCenterPage />)} />
        <Route path="database-manager" element={renderLazyPage(<DatabaseManagerPage />)} />
      </Route>
    </Routes>
  );
}

export default AppRouter;
