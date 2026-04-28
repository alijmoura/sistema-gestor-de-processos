import { auth, functions } from '../auth.js';
import { redirectToLogin } from '../authRedirect.js';

const PRIMARY_DOMAIN = 'ajsmtech.com';

const state = {
  companies: [],
  overview: null,
  modal: null
};

const el = (id) => document.getElementById(id);

function showAlert(message, type = 'info') {
  const container = el('admin-alert');
  if (!container) return;
  container.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
    </div>
  `;
}

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

function callable(name) {
  return functions.httpsCallable(name);
}

function getCompanyPayload() {
  const slug = slugify(el('company-slug').value);
  return {
    empresaId: el('company-id').value.trim() || slug,
    nome: el('company-name').value.trim(),
    slug,
    dominio: `${slug}.${PRIMARY_DOMAIN}`,
    status: el('company-status').value,
    plano: el('company-plan').value,
    limites: {
      usuarios: Number(el('company-users-limit').value) || 1,
      processos: Number(el('company-process-limit').value) || 1,
      whatsapp: el('company-whatsapp').value === 'true'
    },
    assinatura: {
      status: el('company-billing-status').value,
      provider: 'mercado_pago'
    }
  };
}

function setMetrics(overview) {
  el('metric-companies').textContent = overview?.totalEmpresas || 0;
  el('metric-active').textContent = overview?.ativasOuTrial || 0;
  el('metric-suspended').textContent = overview?.suspensas || 0;
  el('metric-memberships').textContent = overview?.totalVinculos || 0;
}

function badgeForStatus(status) {
  const map = {
    ativo: 'success',
    trial: 'primary',
    pagamento_pendente: 'warning',
    suspenso: 'danger',
    cancelado: 'secondary'
  };
  return `<span class="badge text-bg-${map[status] || 'secondary'}">${status || 'indefinido'}</span>`;
}

function renderCompanies() {
  const tbody = el('companies-table-body');
  if (!tbody) return;

  if (!state.companies.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Nenhuma empresa cadastrada.</td></tr>';
    return;
  }

  tbody.innerHTML = state.companies.map((company) => {
    const assinatura = company.assinatura?.status || 'manual';
    const subdomain = company.dominio || `${company.slug}.${PRIMARY_DOMAIN}`;
    return `
      <tr>
        <td>
          <div class="fw-semibold">${company.nome || company.id}</div>
          <div class="small text-muted">${company.id}</div>
        </td>
        <td><a href="https://${subdomain}" target="_blank" rel="noopener">${subdomain}</a></td>
        <td>${badgeForStatus(company.status)}</td>
        <td>${company.plano || 'professional'}</td>
        <td>${assinatura}</td>
        <td class="text-end">
          <button type="button" class="btn btn-sm btn-outline-primary" data-company-edit="${company.id}">
            <i class="bi bi-pencil"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-company-edit]').forEach((button) => {
    button.addEventListener('click', () => openCompanyModal(button.dataset.companyEdit));
  });
}

function renderSelects() {
  const options = state.companies
    .map((company) => `<option value="${company.id}">${company.nome || company.id}</option>`)
    .join('');
  el('membership-company').innerHTML = options;
  el('billing-company').innerHTML = options;
}

function openCompanyModal(companyId = '') {
  const company = state.companies.find((item) => item.id === companyId) || {};
  el('company-id').value = company.id || '';
  el('company-name').value = company.nome || '';
  el('company-slug').value = company.slug || '';
  el('company-status').value = company.status || 'trial';
  el('company-plan').value = company.plano || 'professional';
  el('company-users-limit').value = company.limites?.usuarios || 10;
  el('company-process-limit').value = company.limites?.processos || 5000;
  el('company-whatsapp').value = String(company.limites?.whatsapp !== false);
  el('company-billing-status').value = company.assinatura?.status || 'manual';
  state.modal.show();
}

async function loadAdminData() {
  const [overviewResult, companiesResult] = await Promise.all([
    callable('getSaasAdminOverview')(),
    callable('listEmpresasAdmin')()
  ]);

  state.overview = overviewResult.data || {};
  state.companies = companiesResult.data?.empresas || [];
  setMetrics(state.overview);
  renderCompanies();
  renderSelects();
}

async function saveCompany(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  const payload = getCompanyPayload();
  await callable('createOrUpdateEmpresa')(payload);
  state.modal.hide();
  showAlert('Empresa salva com sucesso.', 'success');
  await loadAdminData();
}

async function saveMembership(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  await callable('linkUserToEmpresa')({
    email: el('membership-email').value.trim(),
    empresaId: el('membership-company').value,
    role: el('membership-role').value
  });
  form.reset();
  showAlert('Usuário vinculado com sucesso.', 'success');
  await loadAdminData();
}

async function createBilling(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  const result = await callable('createMercadoPagoCheckout')({
    empresaId: el('billing-company').value,
    amount: Number(el('billing-amount').value)
  });

  const url = result.data?.initPoint;
  if (url) {
    showAlert(`Cobrança gerada. <a href="${url}" target="_blank" rel="noopener">Abrir checkout</a>.`, 'success');
  } else {
    showAlert('Cobrança registrada, mas o Mercado Pago não retornou URL de checkout.', 'warning');
  }
  await loadAdminData();
}

function bindEvents() {
  el('new-company-btn')?.addEventListener('click', () => openCompanyModal());
  el('company-name')?.addEventListener('input', (event) => {
    if (!el('company-id').value && !el('company-slug').value) {
      el('company-slug').value = slugify(event.target.value);
    }
  });
  el('company-form')?.addEventListener('submit', saveCompany);
  el('membership-form')?.addEventListener('submit', saveMembership);
  el('billing-form')?.addEventListener('submit', createBilling);
  el('admin-logout-btn')?.addEventListener('click', async () => {
    await auth.signOut();
    redirectToLogin();
  });
}

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    redirectToLogin();
    return;
  }

  el('admin-user-email').textContent = user.email || '';
  const token = await user.getIdTokenResult();
  if (token.claims?.admin !== true && token.claims?.super_admin !== true) {
    showAlert('Acesso restrito a super administradores.', 'danger');
    return;
  }

  state.modal = new bootstrap.Modal(el('company-modal'));
  bindEvents();
  try {
    await loadAdminData();
  } catch (error) {
    console.error('[adminSaasPage] Falha ao carregar painel:', error);
    showAlert(`Falha ao carregar painel: ${error.message}`, 'danger');
  }
});
