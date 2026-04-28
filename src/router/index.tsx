import { lazy, Suspense, type ReactNode } from 'react';
import { Spin } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from '../layout/MainLayout';
import HomePage from '../pages/Home';
import LegacyRouteUpgradeNotice from '../components/common/LegacyRouteUpgradeNotice';
import SettingsLayout from '../pages/Settings/SettingsLayout';

const SettingsPage = lazy(() => import('../pages/Settings'));
const SettingsModelsPage = lazy(() => import('../pages/Settings/Models'));
const SettingsAssistantsPage = lazy(() => import('../pages/Settings/Assistants'));
const SettingsDataSourcesPage = lazy(() => import('../pages/Settings/DataSources'));
const SettingsAppsPage = lazy(() => import('../pages/Settings/Apps'));
const TaskDetailPage = lazy(() => import('../pages/Tasks/Detail'));
const TaskOutputPage = lazy(() => import('../pages/Tasks/Output'));
const TasksPage = lazy(() => import('../pages/Tasks'));
const WorkbenchPage = lazy(() => import('../pages/Workbench'));

const SettingsRulesPage = lazy(() => import('../pages/Settings/Placeholders/Rules'));
const SettingsRuntimePage = lazy(() => import('../pages/Settings/Placeholders/Runtime'));
const SettingsGovernancePage = lazy(() => import('../pages/Settings/Placeholders/Governance'));

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
        <Route index element={<HomePage />} />
        <Route path="workbench" element={renderLazyPage(<WorkbenchPage />)} />

        <Route path="tasks" element={renderLazyPage(<TasksPage />)} />
        <Route path="tasks/:taskId" element={renderLazyPage(<TaskDetailPage />)} />
        <Route path="tasks/:taskId/output" element={renderLazyPage(<TaskOutputPage />)} />

        <Route path="settings/overview" element={renderLazyPage(<SettingsPage />)} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route path="models" element={renderLazyPage(<SettingsModelsPage />)} />
          <Route path="assistants" element={renderLazyPage(<SettingsAssistantsPage />)} />
          <Route path="data-sources" element={renderLazyPage(<SettingsDataSourcesPage />)} />
          <Route path="apps" element={renderLazyPage(<SettingsAppsPage />)} />
          <Route path="rules" element={renderLazyPage(<SettingsRulesPage />)} />
          <Route path="runtime" element={renderLazyPage(<SettingsRuntimePage />)} />
          <Route path="governance" element={renderLazyPage(<SettingsGovernancePage />)} />
        </Route>

        <Route path="home" element={<Navigate to="/" replace />} />
        <Route path="settings" element={<Navigate to="/settings/overview" replace />} />
        <Route path="history" element={<LegacyRouteUpgradeNotice />} />
        <Route path="history/:taskId" element={<LegacyRouteUpgradeNotice />} />
        <Route path="sessions/:id" element={<LegacyRouteUpgradeNotice />} />

        <Route path="analyze" element={<LegacyRouteUpgradeNotice />} />
        <Route path="judge" element={<LegacyRouteUpgradeNotice />} />
        <Route path="search" element={<LegacyRouteUpgradeNotice />} />
        <Route path="retrieve" element={<LegacyRouteUpgradeNotice />} />
        <Route path="script" element={<LegacyRouteUpgradeNotice />} />
        <Route path="compose" element={<LegacyRouteUpgradeNotice />} />
        <Route path="agent" element={<LegacyRouteUpgradeNotice />} />
        <Route path="assistant-center" element={<LegacyRouteUpgradeNotice />} />
        <Route path="manage" element={<LegacyRouteUpgradeNotice />} />
        <Route path="model-center" element={<LegacyRouteUpgradeNotice />} />
        <Route path="database-manager" element={<LegacyRouteUpgradeNotice />} />
        <Route path="apps" element={<LegacyRouteUpgradeNotice />} />
        <Route path="output/:taskId" element={<LegacyRouteUpgradeNotice />} />
      </Route>
    </Routes>
  );
}

export default AppRouter;
