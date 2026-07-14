import { useState } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { Button } from '@sgsg/design/components';
import { api, isLoggedIn } from './api';
import { applyTheme, currentTheme, type Theme } from './theme';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import OrderNew from './pages/OrderNew';
import Assignments from './pages/Assignments';
import Experts from './pages/Experts';
import Customers from './pages/Customers';
import Catalog from './pages/Catalog';
import Payments from './pages/Payments';
import Settlements from './pages/Settlements';
import Reviews from './pages/Reviews';
import Inquiries from './pages/Inquiries';
import Wisa from './pages/Wisa';
import Login from './pages/Login';

/// 운영자가 쓰는 순서다. 하루가 '오늘'에서 시작하고, 대부분의 시간을 '주문'에서 쓴다.
const NAV = [
  { to: '/', label: '오늘' },
  { to: '/orders', label: '주문' },
  { to: '/assignments', label: '배정' },
  { to: '/experts', label: '전문가' },
  { to: '/customers', label: '고객' },
  { to: '/catalog', label: '서비스' },
  { to: '/payments', label: '결제' },
  { to: '/settlements', label: '정산' },
  { to: '/reviews', label: '리뷰' },
  { to: '/inquiries', label: '문의' },
  { to: '/wisa', label: '위사몰' },
];

const THEMES: { key: Theme; label: string }[] = [
  { key: 'light', label: '라이트' },
  { key: 'dark', label: '다크' },
  { key: 'system', label: '시스템' },
];

/** 색을 손으로 고르지 않는다. `data-theme` 을 붙이고 떼면 토큰이 알아서 뒤집힌다. */
function ThemeToggle() {
  const [t, setT] = useState<Theme>(currentTheme());

  return (
    <div style={{ display: 'flex', gap: 4, padding: '0 4px', marginTop: 12 }}>
      {THEMES.map((x) => (
        <button
          key={x.key}
          type="button"
          onClick={() => {
            applyTheme(x.key);
            setT(x.key);
          }}
          style={{
            flex: 1,
            padding: '6px 0',
            fontSize: 12,
            borderRadius: 'var(--rd-8)',
            border: '1px solid var(--color-divider-divider)',
            background:
              t === x.key
                ? 'var(--color-background-primary-elevation-1)'
                : 'var(--color-background-elevation-1)',
            // 연한 틴트 위의 글자는 primary-text 다. contents-on 은 브랜드 블루 면 위의 흰 글씨다.
            color:
              t === x.key
                ? 'var(--color-primary-primary-text)'
                : 'var(--color-contents-contents-sub)',
            cursor: 'pointer',
            font: 'inherit',
            fontWeight: 600,
          }}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}

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
        <ThemeToggle />

        <div style={{ marginTop: 12, padding: '0 4px' }}>
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
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Shell><Dashboard /></Shell>} />
        <Route path="/orders" element={<Shell><Orders /></Shell>} />
        {/* 등록(literal)이 :id 보다 **먼저** 와야 한다 — 뒤에 두면 'new' 가 주문 id 로 잡힌다. */}
        <Route path="/orders/new" element={<Shell><OrderNew /></Shell>} />
        <Route path="/orders/:id" element={<Shell><OrderDetail /></Shell>} />
        <Route path="/assignments" element={<Shell><Assignments /></Shell>} />
        <Route path="/experts" element={<Shell><Experts /></Shell>} />
        <Route path="/customers" element={<Shell><Customers /></Shell>} />
        <Route path="/catalog" element={<Shell><Catalog /></Shell>} />
        <Route path="/payments" element={<Shell><Payments /></Shell>} />
        <Route path="/settlements" element={<Shell><Settlements /></Shell>} />
        <Route path="/reviews" element={<Shell><Reviews /></Shell>} />
        <Route path="/inquiries" element={<Shell><Inquiries /></Shell>} />
        <Route path="/wisa" element={<Shell><Wisa /></Shell>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
