import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // 백엔드(4000)가 /admin 아래로 서빙한다. 따로 띄운 5176 은 방화벽 밖에서 안 보인다.
  base: '/admin/',
  build: { outDir: '../bigbang/project/resources/public/admin', emptyOutDir: true },

  // tsconfig 의 preserveSymlinks 와 같은 이유. 번들러도 링크를 따라가면 react 를 못
  // 찾고, @sgsg/design 이 react 를 peer 로 요구하므로 빌드가 죽는다.
  resolve: { preserveSymlinks: true, dedupe: ['react', 'react-dom'] },

  // 백엔드로 프록시한다. 다른 오리진으로 직접 부르면 CORS 허용 목록에 포트를 하나씩
  // 더해야 하고, 그 목록은 배포마다 어긋난다.
  //
  // `preview` 에도 같은 프록시가 필요하다 — dev 서버의 설정은 preview 에 상속되지
  // 않아서, 빌드된 앱을 띄우면 API 호출이 전부 index.html 을 받아 온다.
  server: {
    host: true,
    port: 5175,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },

  preview: {
    host: true,
    port: 5176,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
});
