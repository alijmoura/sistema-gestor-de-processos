# Plano tecnico SaaS multiempresa

Este projeto esta sendo preparado para operar como SaaS multiempresa em subdominios do dominio principal.

## Dominio

- Site institucional: `ajsmtech.com`
- Login geral: `app.ajsmtech.com`
- Painel interno: `admin.ajsmtech.com`
- Empresas: `*.ajsmtech.com`

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

## Proximas etapas tecnicas

1. Migrar documentos existentes para receber `empresaId`.
2. Aplicar `where('empresaId', '==', empresaId)` em todas as consultas operacionais.
3. Endurecer `firestore.rules` das colecoes existentes para exigir `empresaId`.
4. Criar painel interno para cadastrar empresas, vincular usuarios e controlar planos.
5. Integrar cobranca recorrente e atualizar `empresas/{empresaId}.assinatura`.
