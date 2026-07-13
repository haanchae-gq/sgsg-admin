/**
 * 테마.
 *
 * 디자인 시스템의 토큰이 이미 세 갈래를 다 지원한다:
 *
 *   :root                      → 라이트
 *   :root[data-theme='dark']   → 다크
 *   @media (prefers-color-scheme: dark) :root:not([data-theme='light'])
 *                              → 아무것도 안 정했으면 OS 를 따른다
 *
 * 그래서 우리가 할 일은 **`data-theme` 속성을 붙이거나 떼는 것뿐**이다. 색을 손으로
 * 고르지 않는다.
 *
 * 세 번째 상태('시스템')를 없애지 마라. 사람들은 저녁에 폰을 다크로 돌려놓고 낮에
 * 라이트로 돌아온다 — 우리 화면만 밤새 하얗게 있으면 그건 우리가 고집을 부린 것이다.
 */

export type Theme = 'light' | 'dark' | 'system';

const KEY = 'sgsg.admin.theme';

export function currentTheme(): Theme {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') {
    // 속성을 **떼야** 미디어 쿼리가 다시 살아난다. 'system' 이라고 써 넣으면
    // `:root:not([data-theme='light'])` 는 통과해도 `[data-theme='dark']` 규칙이
    // 안 걸려서, OS 가 다크여도 라이트로 남는다.
    root.removeAttribute('data-theme');
    localStorage.removeItem(KEY);
  } else {
    root.setAttribute('data-theme', t);
    localStorage.setItem(KEY, t);
  }
}

/** 앱이 뜨자마자 부른다. 첫 페인트 뒤에 테마가 바뀌면 화면이 한 번 번쩍인다. */
export function initTheme() {
  applyTheme(currentTheme());
}
