/**
 * @file agenciasUI.js
 * @description Interface de usuário para gerenciar agências CEF
 */

import agenciasService from "./agenciasService.js";
import { showNotification } from "./ui.js";
import { escapeHtml, sanitizeAttribute } from "./sanitization.js";

/**
 * Classe para gerenciar a UI de agências
 */
class AgenciasUI {
  constructor() {
    this.modal = null;
    this.form = null;
    this.tableBody = null;
    this.currentEditId = null;
  }

  /**
   * Inicializa a UI de agências
   */
  async init() {
    try {
      // Elementos do DOM
      this.modal = document.getElementById("modal-agencia-admin");
      this.form = document.getElementById("form-agencia");
      this.tableBody = document.getElementById("agencias-table-body");
      
      if (!this.modal || !this.form || !this.tableBody) {
        console.warn(" Elementos de agências não encontrados no DOM");
        return;
      }

      // Bootstrap modal instance
      this.bsModal = new bootstrap.Modal(this.modal);

      // Event listeners
      this.setupEventListeners();

      // Inicializa agências padrão se necessário
      await agenciasService.initializeDefaultAgencias();

      // Renderiza a lista
      await this.renderTable();

      console.log(" AgenciasUI inicializado");
    } catch (error) {
      console.error(" Erro ao inicializar AgenciasUI:", error);
    }
  }

  /**
   * Configura os event listeners
   */
  setupEventListeners() {
    // Botão adicionar agência
    const btnAdd = document.getElementById("btn-add-agencia");
    if (btnAdd) {
      btnAdd.addEventListener("click", () => this.openModalForCreate());
    }

    // Listener para quando o painel de agências for exibido
    const panelAgencias = document.getElementById("panel-agencias");
    if (panelAgencias) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            const isVisible = panelAgencias.style.display !== 'none';
            if (isVisible) {
              console.log(" [AgenciasUI] Painel de agências ficou visível, atualizando...");
              this.renderTable();
            }
          }
        });
      });
      observer.observe(panelAgencias, { attributes: true });
    }

    // Listener para botão de navegação "Agências" nas configurações
    document.addEventListener("click", (e) => {
      const target = e.target.closest('[data-target="panel-agencias"]');
      if (target) {
        console.log(" [AgenciasUI] Botão Agências clicado, renderizando em 100ms...");
        setTimeout(() => this.renderTable(), 100);
      }
    });

    // Submit do formulário
    this.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await this.handleSubmit();
    });

    if (this.tableBody) {
      this.tableBody.addEventListener("click", (event) => {
        const actionButton = event.target.closest("button[data-action]");
        if (!actionButton) return;

        const action = actionButton.dataset.action;
        const id = actionButton.dataset.id || "";

        if (action === "edit" && id) {
          this.editAgencia(id);
          return;
        }

        if (action === "delete" && id) {
          const codigo = actionButton.dataset.codigo || "";
          this.deleteAgencia(id, codigo);
        }
      });
    }

    // Preview em tempo real
    const codigoInput = document.getElementById("agencia-codigo");
    const nomeInput = document.getElementById("agencia-nome");
    const previewCodigo = document.getElementById("preview-codigo");
    const previewNome = document.getElementById("preview-nome");

    if (codigoInput && previewCodigo) {
      codigoInput.addEventListener("input", () => {
        previewCodigo.textContent = codigoInput.value || "0000";
      });
    }

    if (nomeInput && previewNome) {
      nomeInput.addEventListener("input", () => {
        previewNome.textContent = (nomeInput.value || "NOME").toUpperCase();
      });
    }
  }

  /**
   * Garante que os elementos do DOM estão disponíveis
   */
  ensureElements() {
    // Busca elementos sempre que necessário (não confia no cache)
    this.tableBody = document.getElementById("agencias-table-body");
    this.modal = document.getElementById("modal-agencia-admin");
    this.form = document.getElementById("form-agencia");
    
    if (this.modal && !this.bsModal) {
      this.bsModal = new bootstrap.Modal(this.modal);
    }
  }

  /**
   * Renderiza a tabela de agências
   */
  async renderTable() {
    try {
      console.log(" [AgenciasUI] Renderizando tabela...");
      
      // Garante que elementos existem
      this.ensureElements();
      
      const agencias = await agenciasService.getAllAgencias();
      console.log(` [AgenciasUI] ${agencias.length} agências encontradas`);
      
      // Atualiza contador
      const countBadge = document.getElementById("agencias-count");
      if (countBadge) {
        countBadge.textContent = `${agencias.length} ${agencias.length === 1 ? 'agência' : 'agências'}`;
      }

      if (!this.tableBody) {
        console.error(" [AgenciasUI] tableBody não encontrado! Página de configurações pode não estar visível.");
        return;
      }
      
      console.log(" [AgenciasUI] tableBody encontrado, renderizando...");

      if (agencias.length === 0) {
        this.tableBody.innerHTML = `
          <tr>
            <td colspan="3" class="text-center text-muted py-4">
              <i class="bi bi-inbox fs-1 d-block mb-2"></i>
              Nenhuma agência cadastrada
            </td>
          </tr>
        `;
        return;
      }

      this.tableBody.innerHTML = agencias
        .map(
          (ag) => `
        <tr>
          <td><strong>${escapeHtml(ag.codigo)}</strong></td>
          <td>CEF AG ${escapeHtml(ag.codigo)} - ${escapeHtml(ag.nome)}</td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline-primary me-1" data-action="edit" data-id="${sanitizeAttribute(ag.id)}" title="Editar">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${sanitizeAttribute(ag.id)}" data-codigo="${sanitizeAttribute(ag.codigo)}" title="Excluir">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      `
        )
        .join("");
    } catch (error) {
      console.error(" Erro ao renderizar tabela:", error);
      showNotification("Erro ao carregar agências", "error");
    }
  }

  /**
   * Abre o modal para criar nova agência
   */
  openModalForCreate() {
    this.ensureElements();
    this.currentEditId = null;
    this.form.reset();
    document.getElementById("agencia-id").value = "";
    document.getElementById("modal-agencia-admin-title").innerHTML =
      '<i class="bi bi-bank2 me-2"></i>Nova Agência CEF';
    document.getElementById("preview-codigo").textContent = "0000";
    document.getElementById("preview-nome").textContent = "NOME";
    this.bsModal.show();
  }

  /**
   * Abre o modal para editar agência
   */
  async editAgencia(id) {
    try {
      const agencia = await agenciasService.getAgenciaById(id);
      
      if (!agencia) {
        showNotification("Agência não encontrada", "error");
        return;
      }

      this.currentEditId = id;
      document.getElementById("agencia-id").value = id;
      document.getElementById("agencia-codigo").value = agencia.codigo;
      document.getElementById("agencia-nome").value = agencia.nome;
      document.getElementById("modal-agencia-admin-title").innerHTML =
        '<i class="bi bi-pencil me-2"></i>Editar Agência CEF';
      document.getElementById("preview-codigo").textContent = agencia.codigo;
      document.getElementById("preview-nome").textContent = agencia.nome;
      
      this.bsModal.show();
    } catch (error) {
      console.error(" Erro ao carregar agência:", error);
      showNotification("Erro ao carregar dados da agência", "error");
    }
  }

  /**
   * Exclui uma agência
   */
  async deleteAgencia(id, codigo) {
    const confirmed = confirm(
      `Tem certeza que deseja excluir a agência ${codigo}?\n\nEsta ação não pode ser desfeita.`
    );

    if (!confirmed) return;

    try {
      await agenciasService.deleteAgencia(id);
      showNotification("Agência excluída com sucesso!", "success");
      await this.renderTable();
      
      // Atualiza o select de agências no modal de detalhes
      await this.updateAgenciaSelect();
    } catch (error) {
      console.error(" Erro ao excluir agência:", error);
      showNotification("Erro ao excluir agência: " + error.message, "error");
    }
  }

  /**
   * Manipula o submit do formulário
   */
  async handleSubmit() {
    try {
      const data = {
        codigo: document.getElementById("agencia-codigo").value,
        nome: document.getElementById("agencia-nome").value,
      };

      if (this.currentEditId) {
        await agenciasService.updateAgencia(this.currentEditId, data);
        showNotification("Agência atualizada com sucesso!", "success");
      } else {
        await agenciasService.createAgencia(data);
        showNotification("Agência criada com sucesso!", "success");
      }

      this.bsModal.hide();
      await this.renderTable();
      
      // Atualiza o select de agências no modal de detalhes
      await this.updateAgenciaSelect();
    } catch (error) {
      console.error(" Erro ao salvar agência:", error);
      showNotification("Erro ao salvar: " + error.message, "error");
    }
  }

  /**
   * Atualiza o campo de agências no modal de detalhes do processo
   * Suporta tanto SELECT quanto INPUT (para autocomplete inline)
   */
  async updateAgenciaSelect() {
    try {
      const field = document.querySelector("#details-modal #modal-agencia");
      if (!field) {
        console.warn(" Campo de agências não encontrado no modal de detalhes");
        return;
      }

      // Se for um INPUT (novo formato com autocomplete), não precisa popular options
      if (field.tagName === 'INPUT') {
        console.log(" Campo de agências é INPUT (autocomplete inline)");
        return;
      }

      // Código legado para SELECT
      const currentValue = field.value;
      const agencias = await agenciasService.getAgenciasForSelect();

      // Atualiza as opções
      field.innerHTML = '<option value="">-- Selecione --</option>';
      agencias.forEach((agencia) => {
        const option = document.createElement("option");
        option.value = agencia;
        option.textContent = agencia;
        if (agencia === currentValue) {
          option.selected = true;
        }
        field.appendChild(option);
      });

      console.log(" Select de agências atualizado");
    } catch (error) {
      console.error(" Erro ao atualizar campo de agências:", error);
    }
  }

  /**
   * Popula o select de agências (chamado ao carregar modal de detalhes)
   */
  async populateAgenciaSelect() {
    await this.updateAgenciaSelect();
  }

  /**
   * Força atualização completa (tabela + select)
   */
  async refreshAll() {
    console.log(" [AgenciasUI] Forçando atualização completa...");
    await this.renderTable();
    await this.updateAgenciaSelect();
    console.log(" [AgenciasUI] Atualização completa finalizada");
  }
}

// Exporta instância singleton
const agenciasUI = new AgenciasUI();
export default agenciasUI;

// Expõe globalmente para event handlers inline e serviços
if (typeof window !== "undefined") {
  window.agenciasUI = agenciasUI;
  window.agenciasService = agenciasService;
}
