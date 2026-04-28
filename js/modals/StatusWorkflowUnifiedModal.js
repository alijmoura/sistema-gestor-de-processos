/**
 * @fileoverview Gerenciador de Status e Workflows - Modal Unificado
 * Consolidação das funcionalidades de configuração de workflows, status, regras e SLA
 * 
 * @version 1.0.0
 * @date 2026-01-20
 * 
 * Funcionalidades:
 * - Tab 1: Status do Sistema (configuração, ordem, cores)
 * - Tab 2: SLA por Status (prazos em dias úteis)
 * - Tab 3: SLA por Data (alertas de vencimento)
 * - Tab 4: Workflows (tipos de processo)
 * - Tab 5: Regras de Campos (campos obrigatórios por status)
 * 
 * Substitui os modais legados:
 * - modal-status / status-table-config-modal
 * - modal-sla-config
 * - status-rules-modal
 * - workflow-editor-modal
 */

import { StatusTabManager } from './StatusWorkflowUnified_StatusTab.js';
import { SLAStatusTabManager } from './StatusWorkflowUnified_SLAStatusTab.js';
import { SLADateTabManager } from './StatusWorkflowUnified_SLADateTab.js';
import { WorkflowsTabManager } from './StatusWorkflowUnified_WorkflowsTab.js';
import { RulesTabManager } from './StatusWorkflowUnified_RulesTab.js';

export const StatusWorkflowUnifiedModal = {
  id: 'status-workflow-unified-modal',
  tabManagers: {},
  currentTab: 'status',
  unsavedChanges: {
    status: false,
    'sla-status': false,
    'sla-date': false,
    workflows: false,
    rules: false
  },

  render() {
    if (document.getElementById(this.id)) return;

    const html = `
      <!-- Modal: Gerenciador de Status e Workflows (Bootstrap 5) -->
      <div class="modal fade" id="${this.id}" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
        <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable modal-fullscreen-lg-down">
          <div class="modal-content" style="max-height: 90vh; min-height: 80vh; display: flex; flex-direction: column;">
            
            <!-- Header -->
            <div class="modal-header bg-primary text-white flex-shrink-0">
              <h5 class="modal-title">
                <i class="bi bi-diagram-3"></i>
                Gerenciador de Status e Workflows
              </h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            
            <!-- Tabs Navigation -->
            <div class="px-3 pb-3 border-bottom bg-white flex-shrink-0">
              <div class="nav nav-pills nav-fill modern-tabs" role="tablist">
                <button class="nav-link active d-flex align-items-center justify-content-center"
                        type="button" data-tab="status" role="tab">
                  <i class="bi bi-list-check me-2"></i>
                  <span class="tab-text">Status do Sistema</span>
                </button>
                <button class="nav-link d-flex align-items-center justify-content-center"
                        type="button" data-tab="sla-status" role="tab">
                  <i class="bi bi-clock-history me-2"></i>
                  <span class="tab-text">SLA por Status</span>
                </button>
                <button class="nav-link d-flex align-items-center justify-content-center"
                        type="button" data-tab="sla-date" role="tab">
                  <i class="bi bi-calendar-event me-2"></i>
                  <span class="tab-text">SLA por Data</span>
                </button>
                <button class="nav-link d-flex align-items-center justify-content-center"
                        type="button" data-tab="workflows" role="tab">
                  <i class="bi bi-diagram-3 me-2"></i>
                  <span class="tab-text">Workflows</span>
                </button>
                <button class="nav-link d-flex align-items-center justify-content-center"
                        type="button" data-tab="rules" role="tab">
                  <i class="bi bi-check2-square me-2"></i>
                  <span class="tab-text">Regras de Campos</span>
                </button>
              </div>
            </div>
            
            <!-- Tabs Content -->
            <div class="modal-body p-0" style="overflow-y: auto; flex: 1; min-height: 0;">
              
              <!-- ==================== TAB 1: STATUS DO SISTEMA ==================== -->
              <div class="tab-content active p-3" id="tab-status">
                <div id="unified-status-container">
                  <div class="text-center py-5 text-muted">
                    <div class="spinner-border" role="status">
                      <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-3">Carregando configurações de status...</p>
                  </div>
                </div>
              </div>
              
              <!-- ==================== TAB 2: SLA POR STATUS ==================== -->
              <div class="tab-content p-3" id="tab-sla-status">
                <div id="unified-sla-status-container">
                  <div class="text-center py-5 text-muted">
                    <div class="spinner-border" role="status">
                      <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-3">Carregando configurações de SLA...</p>
                  </div>
                </div>
              </div>
              
              <!-- ==================== TAB 3: SLA POR DATA ==================== -->
              <div class="tab-content p-3" id="tab-sla-date">
                <div id="unified-sla-date-container">
                  <div class="text-center py-5 text-muted">
                    <div class="spinner-border" role="status">
                      <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-3">Carregando configurações de campos de data...</p>
                  </div>
                </div>
              </div>
              
              <!-- ==================== TAB 4: WORKFLOWS ==================== -->
              <div class="tab-content p-3" id="tab-workflows">
                <div id="unified-workflows-container">
                  <div class="text-center py-5 text-muted">
                    <div class="spinner-border" role="status">
                      <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-3">Carregando workflows...</p>
                  </div>
                </div>
              </div>

              <!-- ==================== TAB 5: REGRAS DE CAMPOS ==================== -->
              <div class="tab-content p-3" id="tab-rules">
                <div id="unified-rules-container">
                  <div class="text-center py-5 text-muted">
                    <div class="spinner-border" role="status">
                      <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-3">Carregando regras de campos...</p>
                  </div>
                </div>
              </div>

            </div>
            
            <!-- Footer (opcional, pode ser controlado por tab) -->
            <div class="modal-footer d-none border-top">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                Fechar
              </button>
              <button type="button" class="btn btn-primary" id="unified-save-current-tab">
                <i class="bi bi-save"></i> Salvar Alterações
              </button>
            </div>
            
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    this.setupListeners();
    this.setupGlobalEventSync();
    
    console.log('✅ StatusWorkflowUnifiedModal renderizado');
  },

  setupGlobalEventSync() {
    // Listener global para sincronizar mudanças entre tabs
    document.addEventListener('status-workflow-updated', (e) => {
      console.log('🔄 Evento de sincronização recebido:', e.detail);
      this.handleGlobalUpdate(e.detail);
    });
  },

  handleGlobalUpdate(detail) {
    const { type } = detail;

    // Invalidar cache se necessário
    if (window.cacheService?.invalidate) {
      if (type === 'status') {
        window.cacheService.invalidate('statusConfig');
        window.cacheService.invalidate('effectiveStatuses');
      } else if (type === 'sla') {
        window.cacheService.invalidate('slaConfig');
      } else if (type === 'sla-date') {
        window.cacheService.invalidate('slaDateConfig');
      } else if (type === 'workflow') {
        window.cacheService.invalidate('workflows');
      } else if (type === 'rules') {
        window.cacheService.invalidate('status_rules_all');
        window.cacheService.invalidate('statusRules');
      }
    }
    
    // Atualizar EFFECTIVE_STATUS_CONFIG global se status mudou
    if (type === 'status' && window.firestoreService?.getEffectiveStatuses) {
      window.firestoreService.getEffectiveStatuses().then(statuses => {
        window.EFFECTIVE_STATUS_CONFIG = statuses;
        console.log('🔄 EFFECTIVE_STATUS_CONFIG atualizado:', statuses.length);
      });
    }
    
    // Disparar evento para outros componentes
    window.dispatchEvent(new CustomEvent('ui:config:updated', { 
      detail: { source: 'unified-modal', ...detail } 
    }));
  },

  setupListeners() {
    const modal = document.getElementById(this.id);
    if (!modal) return;

    // Listener de abertura do modal via Bootstrap
    modal.addEventListener('show.bs.modal', () => {
      this.onModalOpen();
    });

    // Setup das tabs customizadas (padrão do projeto, não Bootstrap nativo)
    this.setupCustomTabs();

    console.log('✅ StatusWorkflowUnifiedModal listeners configurados');
  },

  setupCustomTabs() {
    const tabButtons = document.querySelectorAll(`#${this.id} .nav-link[data-tab]`);
    const tabContents = document.querySelectorAll(`#${this.id} .tab-content`);

    const setActiveTab = (targetButton) => {
      if (!targetButton) return;

      const targetTabId = targetButton.dataset.tab;
      const targetTabContent = document.getElementById(`tab-${targetTabId}`);

      // Remove active de todos os botões e conteúdos
      tabButtons.forEach((btn) => btn.classList.remove('active'));
      tabContents.forEach((content) => content.classList.remove('active'));

      // Adiciona active no botão e conteúdo alvos
      targetButton.classList.add('active');
      if (targetTabContent) {
        targetTabContent.classList.add('active');
      }

      // Trigger do lazy loading
      this.onTabSwitch(targetTabId);

      console.log(`🔵 Navegando para tab: ${targetTabId}`);
    };

    // Adiciona listeners de click
    tabButtons.forEach((button) => {
      button.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const targetTabId = button.dataset.tab;
        
        // Verificar alterações não salvas antes de trocar
        if (this.hasUnsavedChanges(this.currentTab)) {
          const confirmed = await this.confirmLeaveTab(this.currentTab, targetTabId);
          if (!confirmed) {
            return; // Cancelar troca de tab
          }
        }
        
        // Atualizar tab atual
        this.currentTab = targetTabId;
        
        setActiveTab(button);
      });
    });

    // Ativa a primeira tab por padrão
    const defaultActive = document.querySelector(`#${this.id} .nav-link[data-tab].active`);
    if (defaultActive) {
      setActiveTab(defaultActive);
    }
  },

  onModalOpen() {
    console.log('🔵 Modal unificado aberto - carregando tab Status...');
    
    // Inicializar managers se ainda não existirem
    if (!this.tabManagers.status) {
      this.tabManagers.status = new StatusTabManager();
    }
    
    this.loadStatusTab();
  },

  onTabSwitch(tabId) {
    console.log(`🔵 Trocando para tab: ${tabId}`);

    switch (tabId) {
      case 'status':
        this.loadStatusTab();
        break;
      case 'sla-status':
        this.loadSLAStatusTab();
        break;
      case 'sla-date':
        this.loadSLADateTab();
        break;
      case 'workflows':
        this.loadWorkflowsTab();
        break;
      case 'rules':
        this.loadRulesTab();
        break;
    }
  },

  // ==================== LAZY LOADING DE TABS ====================

  async loadStatusTab() {
    if (!this.tabManagers.status) {
      this.tabManagers.status = new StatusTabManager();
    }
    
    await this.tabManagers.status.render();
  },

  async loadSLAStatusTab() {
    if (!this.tabManagers.slaStatus) {
      this.tabManagers.slaStatus = new SLAStatusTabManager();
    }
    
    await this.tabManagers.slaStatus.render();
  },

  async loadSLADateTab() {
    if (!this.tabManagers.slaDate) {
      this.tabManagers.slaDate = new SLADateTabManager();
    }
    
    await this.tabManagers.slaDate.render();
  },

  async loadWorkflowsTab() {
    if (!this.tabManagers.workflows) {
      this.tabManagers.workflows = new WorkflowsTabManager();
    }

    await this.tabManagers.workflows.render();
  },

  async loadRulesTab() {
    if (!this.tabManagers.rules) {
      this.tabManagers.rules = new RulesTabManager();
    }

    await this.tabManagers.rules.render();
  },

  // ==================== CONTROLE DE ALTERAÇÕES NÃO SALVAS ====================

  /**
   * Marca uma tab como tendo alterações não salvas
   * @param {string} tabId - ID da tab
   */
  markAsUnsaved(tabId) {
    if (this.unsavedChanges.hasOwnProperty(tabId)) {
      this.unsavedChanges[tabId] = true;
      console.log(`⚠️ Tab ${tabId} marcada com alterações não salvas`);
    }
  },

  /**
   * Marca uma tab como salva
   * @param {string} tabId - ID da tab
   */
  markAsSaved(tabId) {
    if (this.unsavedChanges.hasOwnProperty(tabId)) {
      this.unsavedChanges[tabId] = false;
      console.log(`✅ Tab ${tabId} marcada como salva`);
    }
  },

  /**
   * Verifica se uma tab tem alterações não salvas
   * @param {string} tabId - ID da tab
   * @returns {boolean}
   */
  hasUnsavedChanges(tabId) {
    return this.unsavedChanges[tabId] === true;
  },

  /**
   * Confirma saída da tab com alterações não salvas
   * @param {string} fromTab - Tab atual
   * @param {string} toTab - Tab destino
   * @returns {Promise<boolean>} - true se pode trocar, false se cancelou
   */
  async confirmLeaveTab(fromTab, toTab) {
    const tabNames = {
      'status': 'Status do Sistema',
      'sla-status': 'SLA por Status',
      'sla-date': 'SLA por Data',
      'workflows': 'Workflows',
      'rules': 'Regras de Campos'
    };

    const fromName = tabNames[fromTab] || fromTab;
    const toName = tabNames[toTab] || toTab;

    const message = `Você tem alterações não salvas em "${fromName}".\\n\\nDeseja descartar as alterações e ir para "${toName}"?`;
    
    return confirm(message);
  }
};
