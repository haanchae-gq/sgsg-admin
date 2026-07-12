import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Input } from '@sgsg/design/components';
import { api, ApiError } from '../api';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.login(email.trim(), pw);
      nav('/', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '로그인하지 못했어요.');
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div style={{ width: 360 }}>
        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>쓱싹 관리자</div>
        <div style={{ color: 'var(--color-contents-contents-sub)', marginBottom: 16 }}>
          운영팀 계정으로 들어오세요.
        </div>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input label="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input
              label="비밀번호"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit();
              }}
            />
            {error && <Alert type="danger" title={error} />}
            <Button variant="primary" size="l" fullWidth loading={busy} onClick={submit}>
              로그인
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
