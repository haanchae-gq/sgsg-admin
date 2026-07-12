import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { Button } from '@sgsg/design/components';
import { api, isLoggedIn } from './api';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Assignments from './pages/Assignments';
import Wisa from './pages/Wisa';
import Login from './pages/Login';

const NAV = [
  { to: '/', label: '오늘' },
  { to: '/orders', label: '주문' },
  { to: '/assignments', label: '배정' },
  { to: '/wisa', label: '위사몰' },
];

function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();

  if (!isLoggedIn()) return <Navigate to="/login" replace />;

  return (
    <div className="sg-app">
      <nav className="sg-nav">
        <div style={{ fontSize: 18, fontWeight: 800, padding: '4px 12px 16px' }}>쓱싹 관리자</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
            {n.label}
          </NavLink>
        ))}
        <div style={{ marginTop: 24, padding: '0 4px' }}>
          <Button
            variant="ghost"
            size="s"
            fullWidth
            onClick={() => {
              api.logout();
              nav('/login', { replace: true });
            }}
          >
            로그아웃
          </Button>
        </div>
      </nav>
      <main className="sg-main">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Shell><Dashboard /></Shell>} />
        <Route path="/orders" element={<Shell><Orders /></Shell>} />
        <Route path="/assignments" element={<Shell><Assignments /></Shell>} />
        <Route path="/wisa" element={<Shell><Wisa /></Shell>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
