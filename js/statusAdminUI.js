// Atualizado 2025-09-19: Removido uso direto de firebase (legacy collection 'status').
import { isCurrentUserAdmin, listStatuses, createOrUpdateStatus, toggleStatusActive, deleteStatusConfig } from './firestoreService.js';
import { STATUS_CONFIG } from './config.js';

function qs(id) { return document.getElementById(id); }

// Removido fetch direto da coleção legacy 'status'. Utilizamos listStatuses() que já unifica statusConfig.

function renderStatusList(statuses) {
  const tbody = qs('status-admin-list');
  if (!tbody) {
    console.warn(" Elemento 'status-admin-list' não encontrado para renderização");
    return;
  }
  
  tbody.innerHTML = '';
  statuses.sort((a,b) => (a.order||0) - (b.order||0)).forEach((s, idx, arr) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-archive', s.archiveContracts ? 'true' : 'false');
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${s.text}</td>
      <td>
        <input type="text" class="form-control form-control-sm status-stage-edit" value="${s.stage}" data-text="${encodeURIComponent(s.text)}" style="width:110px;display:inline-block;" />
      </td>
      <td>${s.order}</td>
      <td>${Array.isArray(s.nextSteps) ? s.nextSteps.join(', ') : ''}</td>
      <td>
        <div class="form-check form-switch">
          <input class="form-check-input status-archive-toggle" type="checkbox" data-text="${encodeURIComponent(s.text)}" ${s.archiveContracts ? 'checked' : ''} />
        </div>
      </td>
      <td>
        <div class="form-check form-switch">
          <input class="form-check-input status-active-toggle" type="checkbox" data-text="${encodeURIComponent(s.text)}" ${s.active !== false ? 'checked' : ''} />
        </div>
      </td>
      <td class="text-nowrap">
        <button class="btn btn-outline-secondary btn-sm status-move-up" ${idx===0?'disabled':''} data-idx="${idx}"><i class="bi bi-arrow-up"></i></button>
        <button class="btn btn-outline-secondary btn-sm status-move-down" ${idx===arr.length-1?'disabled':''} data-idx="${idx}"><i class="bi bi-arrow-down"></i></button>
        <button class="btn btn-outline-primary btn-sm status-fill-btn" data-text="${encodeURIComponent(s.text)}" data-stage="${encodeURIComponent(s.stage)}" data-order="${s.order}" data-next="${encodeURIComponent((s.nextSteps||[]).join(', '))}"><i class="bi bi-pencil me-1"></i>Editar</button>
        <button class="btn btn-danger btn-sm status-delete-btn" data-text="${encodeURIComponent(s.text)}"><i class="bi bi-trash me-1"></i>Remover</button>
      </td>`;
    tbody.appendChild(tr);
  });
  // Edição inline do campo estágio
  tbody.querySelectorAll('.status-stage-edit').forEach(inp => {
    inp.addEventListener('change', async (e) => {
      const text = decodeURIComponent(e.target.getAttribute('data-text'));
      const newStage = e.target.value.trim();
      if (!newStage) return;
      try {
        qs('status-admin-status').textContent = 'Salvando etapa...';
        await createOrUpdateStatus({ text, stage: newStage });
        qs('status-admin-status').textContent = 'Etapa salva';
        await loadStatuses();
      } catch (err) {
        console.error(err);
        qs('status-admin-status').textContent = 'Erro ao salvar etapa';
      }
    });
  });

  // Mover para cima/baixo
  tbody.querySelectorAll('.status-move-up, .status-move-down').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.getAttribute('data-idx'));
      if (isNaN(idx)) return;
      const statusesSorted = [...statuses].sort((a,b)=>(a.order||0)-(b.order||0));
      if (btn.classList.contains('status-move-up') && idx > 0) {
        // Troca ordem com anterior
        const curr = statusesSorted[idx];
        const prev = statusesSorted[idx-1];
        const tmp = curr.order;
        curr.order = prev.order;
        prev.order = tmp;
        try {
          qs('status-admin-status').textContent = 'Reordenando...';
          await createOrUpdateStatus({ text: curr.text, order: curr.order });
          await createOrUpdateStatus({ text: prev.text, order: prev.order });
          await loadStatuses();
          qs('status-admin-status').textContent = 'Ordem atualizada';
        } catch (err) {
          console.error(err);
          qs('status-admin-status').textContent = 'Erro ao reordenar';
        }
      } else if (btn.classList.contains('status-move-down') && idx < statusesSorted.length-1) {
        // Troca ordem com próximo
        const curr = statusesSorted[idx];
        const next = statusesSorted[idx+1];
        const tmp = curr.order;
        curr.order = next.order;
        next.order = tmp;
        try {
          qs('status-admin-status').textContent = 'Reordenando...';
          await createOrUpdateStatus({ text: curr.text, order: curr.order });
          await createOrUpdateStatus({ text: next.text, order: next.order });
          await loadStatuses();
          qs('status-admin-status').textContent = 'Ordem atualizada';
        } catch (err) {
          console.error(err);
          qs('status-admin-status').textContent = 'Erro ao reordenar';
        }
      }
    });
  });

  // Wire events
  tbody.querySelectorAll('.status-active-toggle').forEach(inp => {
    inp.addEventListener('change', async (e) => {
      const text = decodeURIComponent(e.target.getAttribute('data-text'));
      try {
        qs('status-admin-status').textContent = 'Salvando...';
        await toggleStatusActive(text, e.target.checked);
        qs('status-admin-status').textContent = 'OK';
      } catch (err) {
        console.error(err);
        qs('status-admin-status').textContent = 'Erro ao alternar ativo';
        e.target.checked = !e.target.checked; // rollback
      }
    });
  });

  tbody.querySelectorAll('.status-archive-toggle').forEach(inp => {
    inp.addEventListener('change', async (e) => {
      const text = decodeURIComponent(e.target.getAttribute('data-text'));
      const targetStatus = statuses.find((status) => status.text === text);
      if (!targetStatus) {
        return;
      }

      try {
        qs('status-admin-status').textContent = 'Atualizando arquivamento...';
        await createOrUpdateStatus({
          text,
          stage: targetStatus.stage,
          order: targetStatus.order,
          nextSteps: targetStatus.nextSteps || [],
          active: targetStatus.active !== false,
          archiveContracts: e.target.checked,
          color: targetStatus.color,
          bgColor: targetStatus.bgColor
        });
        qs('status-admin-status').textContent = e.target.checked ? 'Status arquivado' : 'Status reativado na lista';
      } catch (err) {
        console.error(err);
        qs('status-admin-status').textContent = 'Erro ao atualizar arquivamento';
        e.target.checked = !e.target.checked;
      }
    });
  });

  tbody.querySelectorAll('.status-fill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      qs('status-text').value = decodeURIComponent(btn.getAttribute('data-text'));
      qs('status-stage').value = decodeURIComponent(btn.getAttribute('data-stage'));
      qs('status-order').value = btn.getAttribute('data-order');
      qs('status-next-steps').value = decodeURIComponent(btn.getAttribute('data-next'));
      qs('status-text').focus();
    });
  });

  tbody.querySelectorAll('.status-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = decodeURIComponent(btn.getAttribute('data-text'));
      if (!confirm(`Remover o status "${text}"?`)) return;
      try {
        qs('status-admin-status').textContent = 'Removendo...';
        await deleteStatusConfig(text, false);
        qs('status-admin-status').textContent = 'Status removido';
        await loadStatuses();
      } catch (err) {
        console.warn('Remoção bloqueada, tentando exclusão forçada?', err);
        if (confirm('Este status pode estar em uso. Remover mesmo assim (forçado)?')) {
          try {
            await deleteStatusConfig(text, true);
            qs('status-admin-status').textContent = 'Status removido (forçado)';
            await loadStatuses();
          } catch (e2) {
            console.error(e2);
            qs('status-admin-status').textContent = 'Erro ao remover';
          }
        } else {
          qs('status-admin-status').textContent = 'Remoção cancelada';
        }
      }
    });
  });
}

async function loadStatuses() {
  try {
    console.log(" Carregando lista de status...");
    
    const statusElement = qs('status-admin-status');
    const tbody = qs('status-admin-list');
    
    // Verifica se os elementos existem antes de tentar usá-los
    if (!statusElement) {
      console.warn(" Elemento 'status-admin-status' não encontrado. Modal pode não estar visível.");
      return;
    }
    
    if (!tbody) {
      console.warn(" Elemento 'status-admin-list' não encontrado. Modal pode não estar visível.");
      return;
    }
    
    statusElement.textContent = 'Carregando...';
    statusElement.style.color = 'blue';
    
    let statuses = [];
    let isFromDatabase = false;
    
    try {
      console.log(" Chamando listStatuses() unificado...");
      statuses = await listStatuses();
      if (Array.isArray(statuses) && statuses.length) {
        isFromDatabase = true;
      } else {
        throw new Error('Lista vazia');
      }
    } catch {
      console.warn(' listStatuses falhou ou vazio. Fallback STATUS_CONFIG mínimo.');
      statuses = STATUS_CONFIG.map(s => ({
        text: s.text,
        stage: s.stage,
        order: s.order,
        nextSteps: s.nextSteps || [],
        active: true
      }));
      isFromDatabase = false;
    }
    
    console.log(" Status carregados:", statuses);
    
    if (!statuses || statuses.length === 0) {
      console.log(" Nenhum status encontrado");
      statusElement.textContent = 'Nenhum status encontrado';
      statusElement.style.color = 'orange';
      
      // Renderiza lista vazia mas mostra mensagem
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: orange;">Nenhum status configurado</td></tr>';
      return;
    }
    
    renderStatusList(statuses);
    
    if (isFromDatabase) {
      statusElement.textContent = `${statuses.length} status carregados (statusConfig)`;
      statusElement.style.color = 'green';
    } else {
      statusElement.textContent = `${statuses.length} status de emergência carregados (STATUS_CONFIG mínimo)`;
      statusElement.style.color = 'orange';
      
      // Adicionar aviso sobre fallback
      const tbody = qs('status-admin-list');
      if (tbody && statuses.length <= 5) {
        const warningRow = document.createElement('tr');
        warningRow.style.backgroundColor = '#fff3cd';
        warningRow.innerHTML = `
          <td colspan="7" style="text-align: center; color: #856404; padding: 15px;">
             <strong>Atenção:</strong> Usando STATUS_CONFIG mínimo como fallback.<br>
            Os 46 status completos estão no banco de dados mas não puderam ser carregados.<br>
            <small>Verifique as permissões do Firestore ou tente recarregar a página.</small>
          </td>
        `;
        tbody.appendChild(warningRow);
      }
    }
    
    console.log(` ${statuses.length} status renderizados com sucesso (fonte: ${isFromDatabase ? 'Firebase' : 'config.js'})`);
    
  } catch (err) {
    console.error(' Erro ao carregar status:', err);
    
    const statusElement = qs('status-admin-status');
    const tbody = qs('status-admin-list');
    
    if (statusElement) {
      statusElement.textContent = 'Erro: ' + (err.message || 'Falha ao carregar');
      statusElement.style.color = 'red';
    }
    
    // Mostra erro na tabela também
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Erro ao carregar status: ' + (err.message || 'Falha desconhecida') + '</td></tr>';
    }
  }
}

function initForm() {
  const form = qs('status-admin-form');
  if (!form) {
    console.warn(" Formulário 'status-admin-form' não encontrado");
    return;
  }
  
  // Event listener para o formulário de adicionar/atualizar
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const statusElement = qs('status-admin-status');
    const textInput = qs('status-text');
    const stageInput = qs('status-stage');
    const orderInput = qs('status-order');
    const nextStepsInput = qs('status-next-steps');
    const archiveInput = qs('status-archive-flag');
    
    if (!textInput || !stageInput || !orderInput) {
      console.error(" Campos do formulário não encontrados");
      if (statusElement) {
        statusElement.textContent = 'Erro: Campos do formulário não encontrados';
        statusElement.style.color = 'red';
      }
      return;
    }
    
    const text = textInput.value.trim();
    const stage = stageInput.value.trim();
    const order = Number(orderInput.value);
    const nextSteps = (nextStepsInput?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    
    if (!text || !stage || isNaN(order)) {
      if (statusElement) {
        statusElement.textContent = 'Preencha nome, etapa e ordem';
        statusElement.style.color = 'orange';
      }
      return;
    }
    
    try {
      if (statusElement) {
        statusElement.textContent = 'Salvando...';
        statusElement.style.color = 'blue';
      }
      
      await createOrUpdateStatus({ text, stage, order, nextSteps, active: true, archiveContracts: !!archiveInput?.checked });
      
      if (statusElement) {
        statusElement.textContent = 'Salvo';
        statusElement.style.color = 'green';
      }
      
      form.reset();
      await loadStatuses();
    } catch (err) {
      console.error(err);
      if (statusElement) {
        statusElement.textContent = 'Erro ao salvar: ' + (err.message || 'Falha desconhecida');
        statusElement.style.color = 'red';
      }
    }
  });
  
  // Event listener para o botão de recarregar
  const reloadBtn = qs('status-admin-reload-btn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      console.log(" Recarregando lista de status manualmente...");
      await loadStatuses();
    });
  } else {
    console.warn(" Botão 'status-admin-reload-btn' não encontrado");
  }
  
  // Event listener para o botão de sincronização
  const syncBtn = qs('status-admin-sync-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      if (confirm('Deseja sincronizar todos os status do config.js com o banco de dados? Isso criará/atualizará status que ainda não existem.')) {
        await syncStatusWithConfig();
      }
    });
  } else {
    console.warn(" Botão 'status-admin-sync-btn' não encontrado");
  }
}

async function syncStatusWithConfig() {
  const statusElement = qs('status-admin-status');
  
  try {
    if (statusElement) {
      statusElement.textContent = 'Sincronizando com config.js...';
      statusElement.style.color = 'blue';
    }
    
    console.log(" Iniciando sincronização com STATUS_CONFIG mínimo...");
    console.log(" NOTA: Função mantida para casos de emergência, mas a sincronização principal já foi feita.");
    
    // Carrega status existentes do Firebase
    let existingStatuses = [];
    try {
      existingStatuses = await listStatuses();
    } catch {
      console.warn("Não foi possível carregar status existentes, criando todos do zero");
    }
    
    const existingNames = new Set(existingStatuses.map(s => s.text));
    
    let syncCount = 0;
    
    // Percorre todos os status do config.js
    for (const configStatus of STATUS_CONFIG) {
      if (!existingNames.has(configStatus.text)) {
        try {
          await createOrUpdateStatus({
            text: configStatus.text,
            stage: configStatus.stage,
            order: configStatus.order,
            nextSteps: configStatus.nextSteps || [],
            active: true
          });
          syncCount++;
          console.log(` Status criado: ${configStatus.text}`);
        } catch (error) {
          console.error(` Erro ao criar status ${configStatus.text}:`, error);
        }
      }
    }
    
    if (statusElement) {
      statusElement.textContent = `${syncCount} status sincronizados com sucesso`;
      statusElement.style.color = 'green';
    }
    
    console.log(` Sincronização concluída: ${syncCount} status adicionados`);
    
    // Recarrega a lista
    await loadStatuses();
    
  } catch (error) {
    console.error(" Erro durante sincronização:", error);
    if (statusElement) {
      statusElement.textContent = 'Erro durante sincronização: ' + (error.message || 'Falha desconhecida');
      statusElement.style.color = 'red';
    }
  }
}

export async function initStatusAdminUI() {
  try {
    console.log(" Iniciando StatusAdminUI...");
    
    // Verifica se os elementos necessários existem
    const statusElement = qs('status-admin-status');
    const formElement = qs('status-admin-form');
    const listElement = qs('status-admin-list');
    
    if (!statusElement || !formElement || !listElement) {
      console.log(" Elementos da interface de status não encontrados. Página de configurações pode não estar carregada.");
      console.log("- status-admin-status:", !!statusElement);
      console.log("- status-admin-form:", !!formElement);
      console.log("- status-admin-list:", !!listElement);
      return;
    }
    
    const isAdmin = await isCurrentUserAdmin();
    console.log(" Usuário é admin:", isAdmin);
    
    // Não escondemos a seção inteira; apenas carregamos se admin.
    if (!isAdmin) {
      console.log(" Usuário não é admin - funcionalidade bloqueada");
      statusElement.textContent = 'Acesso restrito a administradores';
      statusElement.style.color = 'orange';
      return;
    }
    
    console.log(" Inicializando formulário e carregando status...");
    initForm();
    await loadStatuses();
    console.log(" StatusAdminUI inicializado com sucesso");
  } catch (err) {
    console.error(' Erro ao inicializar StatusAdminUI:', err);
    
    const statusElement = qs('status-admin-status');
    if (statusElement) {
      statusElement.textContent = 'Erro ao carregar: ' + (err.message || 'Erro desconhecido');
      statusElement.style.color = 'red';
    }
  }
}

// Função de debug para testar via console do navegador
window.debugStatusAdmin = {
  async testFirestoreConnection() {
    try {
      console.log(" Testando conexão com Firestore (statusConfig)...");
      const result = await listStatuses();
      console.log(" listStatuses operacional. Total:", Array.isArray(result)? result.length : 'n/d');
      return true;
    } catch (error) {
      console.error(" Erro ao executar listStatuses:", error);
      return false;
    }
  },
  
  async testListStatuses() {
    try {
      console.log(" Testando função listStatuses...");
      const result = await listStatuses();
      console.log(" Resultado:", result);
      return result;
    } catch (error) {
      console.error(" Erro em listStatuses:", error);
      return null;
    }
  },
  
  // testDirectFirestore removido (coleção legacy 'status' descontinuada)
  
  async reloadStatusList() {
    console.log(" Recarregando lista de status...");
    await loadStatuses();
  },
  async checkOrdering(){
    try {
      const list = await listStatuses();
      const orders = list.map(s=>s.order);
      const set = new Set();
      const duplicates = [];
  orders.forEach(o=>{ if(set.has(o)) duplicates.push(o); else set.add(o); });
      const sorted = [...list].sort((a,b)=> (a.order||0)-(b.order||0));
      let last = -Infinity; let regressions = [];
      for(const s of sorted){ if((s.order||0) < last){ regressions.push({after:last, current:s}); } last = s.order||0; }
      console.group(' Validação de Ordenação de Status');
      console.log('Total:', list.length);
      console.log('Duplicados:', duplicates);
      console.log('Regressões:', regressions);
      const gaps = [];
      for(let i=1;i<sorted.length;i++){ const diff = (sorted[i].order||0) - (sorted[i-1].order||0); if(diff>1){ gaps.push({ from: sorted[i-1].text, to: sorted[i].text, gap: diff}); } }
      console.log('Gaps (>1):', gaps);
      console.groupEnd();
      return { duplicates, regressions, gaps };
    } catch(e){ console.error('Falha checkOrdering', e); }
  },
  async suggestSequential(){
    const list = await listStatuses();
    const sorted = [...list].sort((a,b)=>(a.order||0)-(b.order||0));
    const suggestion = sorted.map((s,i)=>({ text: s.text, old: s.order, suggested: i+1 }));
    console.table(suggestion);
    console.log(' Aplique manualmente se fizer sentido:');
    console.log('Exemplo para aplicar um item: createOrUpdateStatus({ text: "NOME", stage: "...", order: NOVO, nextSteps: [...], active: true })');
    return suggestion;
  }
};

// Autoinit quando módulo for carregado, mas aguarda DOM
let statusAdminBootstrapped = false;

function bootstrapStatusAdminIfNeeded(force = false) {
  if (statusAdminBootstrapped && !force) {
    return;
  }

  const container = document.getElementById('page-configuracoes');
  if (!container) {
    return;
  }

  const hasElements = container.querySelector('#status-admin-status')
    && container.querySelector('#status-admin-form')
    && container.querySelector('#status-admin-list');

  if (!hasElements) {
    return;
  }

  statusAdminBootstrapped = true;
  initStatusAdminUI();
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.__UI_COMPONENTS_RENDERED__) {
    bootstrapStatusAdminIfNeeded();
  } else {
    window.addEventListener('ui:components:rendered', () => bootstrapStatusAdminIfNeeded());
  }
});

document.addEventListener('whatsapp:navigation', (event) => {
  const target = event?.detail?.page;
  if (target === 'configuracoes') {
    bootstrapStatusAdminIfNeeded(true);
  }
});
