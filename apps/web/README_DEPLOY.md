# Frontend Deploy Notes

O frontend do hackathon foi preparado para deploy simples em:

- Railway
- Vercel

## Variável obrigatória

- `NEXT_PUBLIC_API_URL`

Valor esperado:

```text
https://YOUR_API_HOST/api
```

Em desenvolvimento local:

```text
http://localhost:8000/api
```

## Vercel

Configuração:

- root directory: `apps/web`
- framework: Next.js
- env var: `NEXT_PUBLIC_API_URL`

Arquivo usado:

- `vercel.json`

## Railway

Configuração futura:

- service root: `apps/web`
- Dockerfile: `apps/web/Dockerfile`
- env var obrigatória: `NEXT_PUBLIC_API_URL`
- porta esperada no container: `PORT`

O container usa:

- build de produção do Next.js
- saída `standalone`
- `node server.js`

Não rode deploy agora. A preparação do repositório já está pronta para isso.

## Happy path da demo

Páginas prontas:

- `/dashboard`
- `/properties`
- `/contracts`
- `/charges`
- `/documents`
- `/tasks`

Ações prontas:

- `Novo imóvel`
- `Novo contrato`
- `Gerar cobrança mensal`
- `Anexar IPTU`
- `Anexar condomínio`
- `Consolidar cobrança`
- `Gerar boleto/PIX`
