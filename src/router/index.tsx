import { Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from '../layout/MainLayout';
import AnalyzePage from '../pages/Analyze';
import HomePage from '../pages/Home';
import ScriptPage from '../pages/Script';
import SearchPage from '../pages/Search';

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="analyze" element={<AnalyzePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="script" element={<ScriptPage />} />
      </Route>
    </Routes>
  );
}

export default AppRouter;