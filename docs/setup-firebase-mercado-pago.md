# Setup Firebase e Mercado Pago

## Firebase

Projeto configurado no repositorio:

```txt
projectId: gestor-de-processos-a541c
authDomain: gestor-de-processos-a541c.firebaseapp.com
storageBucket: gestor-de-processos-a541c.firebasestorage.app
measurementId: G-DH56341485
```

Arquivos atualizados:

- `.firebaserc`
- `js/auth.js`

No Console Firebase:

1. Ative Authentication com o provedor `Email/senha`.
2. Crie o Firestore Database em modo producao.
3. Ative Cloud Storage.
4. Em Hosting, conecte `admin.ajsmtech.com` e os subdominios das empresas.
5. Em Firestore, publique `firestore.rules` e `firestore.indexes.json`.
6. Em Storage, publique `storage.rules`.
7. Em Functions, publique `functions/index.js`.

Comandos de deploy:

```bash
firebase use gestor-de-processos-a541c
firebase deploy --only firestore,storage
firebase deploy --only functions
firebase deploy --only hosting
```

Depois do deploy e com credenciais Admin disponiveis, rode o backfill:

```bash
npm run saas:migrate:dry
npm run saas:migrate
```

## Mercado Pago

Use Checkout Pro com criacao de preferencias pelo backend.

No painel Mercado Pago Developers:

1. Crie uma aplicacao para o SaaS.
2. Copie o `Access Token` de producao.
3. Configure Webhook de pagamentos para:

```txt
https://southamerica-east1-gestor-de-processos-a541c.cloudfunctions.net/mercadoPagoWebhook
```

4. Ative o evento `payment`/`Pagamentos`.
5. Copie a chave secreta do webhook.

No arquivo local `functions/.env`:

```txt
SAAS_PRIMARY_DOMAIN=ajsmtech.com
MERCADO_PAGO_ACCESS_TOKEN=APP_USR_SEU_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_SECRET=SUA_CHAVE_SECRETA_DO_WEBHOOK
```

Nao commite `functions/.env`. O repositorio inclui apenas `functions/.env.example`.

O painel `admin.html` chama:

- `createMercadoPagoCheckout`
- `mercadoPagoWebhook`

## Referencias oficiais

- Firebase Functions com `.env`: https://firebase.google.com/docs/functions/config-env
- Firebase Hosting com dominio customizado: https://firebase.google.com/docs/hosting/custom-domain
- Mercado Pago Checkout Pro - preferencias: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/create-payment-preference
- Mercado Pago Checkout Pro - notificacoes: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications
