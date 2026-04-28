import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import AdminLayout from './components/Layout';
import Apps from './pages/Apps';
import Channels from './pages/Channels';
import Connections from './pages/Connections';
import Conversations from './pages/Conversations';
import Dashboard from './pages/Dashboard';
import Evolution from './pages/Evolution';
import Knowledge from './pages/Knowledge';
import KnowledgeGaps from './pages/KnowledgeGaps';
import Rules from './pages/Rules';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="factory" element={<Navigate to="/dashboard" replace />} />
          <Route path="connections" element={<Connections />} />
          <Route path="channels" element={<Channels />} />
          <Route path="conversations" element={<Conversations />} />
          <Route path="rules" element={<Rules />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="knowledge-gaps" element={<KnowledgeGaps />} />
          <Route path="evolution" element={<Evolution />} />
          <Route path="apps" element={<Apps />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
