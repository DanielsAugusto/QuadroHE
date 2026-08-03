# QuadroHE

Sistema da Secretaria para conectar **Hora Extra** e **alocação de tempos por escola**, com a **matrícula** como chave.

## Stack

- **Vite + React + TypeScript** (frontend)
- **Express + SQLite** (API)
- **bcrypt** (senha)
- **JWT** (sessão)
- **express-rate-limit** (proteção do login: 10 tentativas / 15 min)

## Como rodar

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:3001  

Login padrão (criado na primeira execução):

- E-mail: `admin@secretaria.local`
- Senha: `admin123`

Altere no `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`).

## Fluxo

1. Cadastre professores, escolas e disciplinas  
2. Lance a Hora Extra (tempos autorizados)  
3. Lance as alocações (escola / turno / tempos)  
4. Veja o saldo na ficha do professor e no dashboard  
