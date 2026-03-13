# Frontend Deploy Notes

O frontend do hackathon foi preparado para dois caminhos simples:

- Vercel
- Cloud Run
- Railway

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

## Cloud Run

Build:

```bash
docker build -t realestateos-web ./apps/web
```

Run local:

```bash
docker run --rm -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://localhost:8000/api \
  realestateos-web
```

O container usa:

- build de produção do Next.js
- saída `standalone`
- `node server.js`

## Railway

Configuração futura:

- service root: `apps/web`
- Dockerfile: `apps/web/Dockerfile`
- env var obrigatória: `NEXT_PUBLIC_API_URL`
- porta esperada no container: `PORT`

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
