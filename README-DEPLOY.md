# INFOR IEST — Deploy Netlify + Render + PostgreSQL

## Arquitectura
- Frontend: Netlify (React + Vite)
- Backend: Render (Node.js + Express)
- Base de dados: PostgreSQL (Supabase, Neon ou PostgreSQL gerido no Render)
- Código: GitHub

## 1. GitHub
Crie um repositório e envie todos os ficheiros desta pasta.
Não envie `.env` nem passwords reais.

## 2. PostgreSQL
Crie uma base PostgreSQL num fornecedor à sua escolha e copie a `DATABASE_URL`.
A aplicação cria automaticamente as tabelas na primeira inicialização.

## 3. Backend no Render
Crie um Web Service a partir do repositório:
- Runtime: Node
- Build Command: `npm ci`
- Start Command: `npm run start`
- Health Check: `/api/health`

Variáveis:
- `NODE_ENV=production`
- `DATABASE_URL=...`
- `FRONTEND_URL=https://SEU-SITE.netlify.app`
- `BACKEND_URL=https://SEU-BACKEND.onrender.com`
- `ADMIN_EMAIL=...`
- `ADMIN_PASSWORD=...`

Depois do deploy teste:
`https://SEU-BACKEND.onrender.com/api/health`

## 4. Frontend no Netlify
Importe o mesmo repositório.
- Build command: `npm run build`
- Publish directory: `dist`

Em Environment Variables adicione:
`VITE_API_URL=https://SEU-BACKEND.onrender.com`

Faça um novo deploy.

## 5. Login administrativo
Abra:
`https://SEU-SITE.netlify.app/login`

Entre com o `ADMIN_EMAIL` e `ADMIN_PASSWORD` configurados no Render.
Depois será encaminhado para:
`https://SEU-SITE.netlify.app/admin`

## 6. OAuth Google
No Google Cloud crie OAuth Client ID do tipo Web application.
Authorized JavaScript origin:
`https://SEU-SITE.netlify.app`

Authorized redirect URI:
`https://SEU-BACKEND.onrender.com/api/auth/google/callback`

Copie Client ID e Secret para as variáveis do Render:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`.

## 7. OAuth GitHub
Crie uma OAuth App no GitHub.
Homepage URL:
`https://SEU-SITE.netlify.app`
Authorization callback URL:
`https://SEU-BACKEND.onrender.com/api/auth/github/callback`

Copie para o Render:
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`.

## 8. Domínio próprio
Quando tiver `www.inforiest.ao`, substitua `FRONTEND_URL` pelo domínio final e actualize as URLs de callback OAuth. No Netlify configure o domínio personalizado.

## Segurança antes de produção
- Troque a password inicial do administrador.
- Não publique `.env`.
- Use HTTPS.
- Restrinja `FRONTEND_URL` ao domínio real.
- Considere rate limiting, recuperação de password, 2FA e logs antes de uso empresarial intenso.
