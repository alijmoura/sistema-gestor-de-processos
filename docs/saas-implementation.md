# Plano tecnico SaaS multiempresa

Este projeto esta sendo preparado para operar como SaaS multiempresa em subdominios do dominio principal.

## Dominio

- Site institucional: `ajsmtech.com`
- Login geral: `app.ajsmtech.com`
- Painel interno: `admin.ajsmtech.com`
- Empresas: `*.ajsmtech.com`

Setup operacional do Firebase e Mercado Pago: `docs/setup-firebase-mercado-pago.md`.

Exemplo:

```txt
cliente-alpha.ajsmtech.com
empresa-demo.ajsmtech.com
```

## Modelo inicial

### `empresas/{empresaId}`

```js
{
  nome: "Empresa Cliente",
  slug: "empresa-cliente",
  dominio: "empresa-cliente.ajsmtech.com",
  status: "ativo", // ativo, trial, pagamento_pendente, suspenso, cancelado
  plano: "professional",
  limites: {
    usuarios: 10,
    processos: 5000,
    whatsapp: true
  },
  criadoEm: serverTimestamp()
}
```

### `user_tenants/{uid}_{empresaId}`

```js
{
  uid: "firebase-auth-uid",
  empresaId: "empresa-id",
  role: "empresa_admin",
  status: "ativo",
  criadoEm: serverTimestamp()
}
```

## Resolucao de tenant

O arquivo `js/tenantService.js` resolve a empresa atual por:

1. subdominio em `*.ajsmtech.com`;
2. parametro `?tenant=slug` em desenvolvimento local;
3. empresa padrao vinculada ao usuario, quando nao houver subdominio.

O bootstrap autenticado grava o contexto em:

```js
window.currentTenant
window.currentTenantContext
window.appState.currentTenant
window.appState.currentEmpresaId
```

## Implementacao inicial

### Painel interno

- Arquivo: `admin.html`
- Entrada JS: `js/pages/adminSaasPage.js`
- Dominio alvo: `admin.ajsmtech.com`
- Acesso: usuarios com custom claim `admin` ou `super_admin`.

### Migracao da base validada

```bash
npm run saas:migrate:dry
npm run saas:migrate
```

O script cria/atualiza `empresas/ajsmtech-demo`, vincula usuarios atuais em `user_tenants` e preenche `empresaId`/`tenantId` nas colecoes operacionais conhecidas.

### Mercado Pago

Configure as variaveis de ambiente no runtime das Cloud Functions:

```txt
MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_SECRET
SAAS_PRIMARY_DOMAIN
```

Endpoints adicionados:

- `createMercadoPagoCheckout`
- `mercadoPagoWebhook`

### Regras

As regras de Firestore e Storage passaram a exigir `empresaId` para colecoes operacionais. Caminhos novos de Storage devem usar:

```txt
empresas/{empresaId}/contracts/{contractId}/{filename}
empresas/{empresaId}/whatsapp/{chatId}/{filename}
empresas/{empresaId}/activity-audit/{module}/{year}/{month}/{filename}
```

## Proximas etapas tecnicas

1. Continuar removendo acessos diretos a colecoes raiz nos servicos especializados.
2. Ajustar agregados server-side para particionamento por empresa.
3. Adicionar testes de rules no emulator cobrindo vazamento cross-tenant.
4. Configurar DNS wildcard e dominios customizados no Firebase Hosting.
