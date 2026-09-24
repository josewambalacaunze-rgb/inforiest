# INFOR IEST — Site + Back Office

Website responsivo da INFOR IEST, construído em React + Vite, com servidor Node.js/Express, autenticação local, Google/GitHub OAuth e painel administrativo.

## Executar

1. Instale Node.js 20+.
2. `npm install`
3. Copie `.env.example` para `.env` e altere `ADMIN_PASSWORD`.
4. Para desenvolvimento do frontend: `npm run dev`.
5. Para o backend/API: `npm run server`.
6. Para produção: `npm run build` e depois `npm start`.

> Em desenvolvimento, o Vite deve encaminhar `/api` para o Express. Se executar frontend e backend em portas diferentes, configure o proxy no `vite.config.ts`.

## Login social

Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` e `GITHUB_CALLBACK_URL` no `.env`.

Callbacks locais:
- Google: `http://localhost:3000/api/auth/google/callback`
- GitHub: `http://localhost:3000/api/auth/github/callback`

## Área administrativa

- `/login` — login local e OAuth.
- `/admin` — painel protegido.
- Leads/pedidos recebidos pelos formulários.
- Gestão de estado dos pedidos.
- Configurações públicas da empresa.
- Lista de utilizadores e método de autenticação.

Os dados persistentes ficam em `server-data/store.json`. Para produção, recomenda-se trocar o armazenamento JSON por PostgreSQL/MySQL e usar um store de sessões persistente.
