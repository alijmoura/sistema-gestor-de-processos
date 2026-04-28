/**
 * @file cartoriosUI.js
 * @description Interface de usuário para gerenciar cartórios
 */

import cartoriosService from "./cartoriosService.js";
import { showNotification } from "./ui.js";

/**
 * Classe para gerenciar a UI de cartórios
 */
class CartoriosUI {
  constructor() {
    this.modal = null;
    this.form = null;
    this.tableBody = null;
    this.currentEditId = null;
  }

  /**
   * Inicializa a UI de cartórios
   */
  async init() {
    try {
      // Elementos do DOM
      this.modal = document.getElementById("modal-cartorio-admin");
      this.form = document.getElementById("form-cartorio");
      this.tableBody = document.getElementById("cartorios-table-body");
      
      if (!this.modal || !this.form || !this.tableBody) {
        // Elementos de cartórios não encontrados - normal se não for admin ou se modal não foi injetado ainda
        return;
      }

      // Bootstrap modal instance
      this.bsModal = new bootstrap.Modal(this.modal);

      // Event listeners
      this.setupEventListeners();

      // Renderiza a lista
      await this.renderTable();

      console.log(" CartoriosUI inicializado");
    } catch (error) {
      console.error(" Erro ao inicializar CartoriosUI:", error);
    }
  }

  /**
   * Configura os event listeners
   */
  setupEventListeners() {
    // Botão adicionar cartório
    const btnAdd = document.getElementById("btn-add-cartorio");
    if (btnAdd) {
      btnAdd.addEventListener("click", () => this.openModalForCreate());
    }

    // Botão importar de contratos
    const btnImport = document.getElementById("btn-import-cartorios");
    if (btnImport) {
      btnImport.addEventListener("click", () => this.importFromContracts());
    }

    // Listener para quando o painel de cartórios for exibido
    const panelCartorios = document.getElementById("panel-cartorios");
    if (panelCartorios) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            const isVisible = panelCartorios.style.display !== 'none';
            if (isVisible) {
              console.log(" [CartoriosUI] Painel de cartórios ficou visível, atualizando...");
              this.renderTable();
            }
          }
        });
      });
      observer.observe(panelCartorios, { attributes: true });
    }

    // Listener para botão de navegação "Cartórios" nas configurações
    document.addEventListener("click", (e) => {
      const target = e.target.closest('[data-target="panel-cartorios"]');
      if (target) {
        console.log(" [CartoriosUI] Botão Cartórios clicado, renderizando em 100ms...");
        setTimeout(() => this.renderTable(), 100);
      }
    });

    // Submit do formulário
    if (this.form) {
      this.form.addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handleSubmit();
      });
    }

    // Preview em tempo real
    const nomeInput = document.getElementById("cartorio-nome");
    const previewNome = document.getElementById("preview-cartorio-nome");

    if (nomeInput && previewNome) {
      nomeInput.addEventListener("input", () => {
        previewNome.textContent = (nomeInput.value || "NOME DO CARTÓRIO").toUpperCase();
      });
    }
  }

  /**
   * Garante que os elementos do DOM estão disponíveis
   */
  ensureElements() {
    this.tableBody = document.getElementById("cartorios-table-body");
    this.modal = document.getElementById("modal-cartorio-admin");
    this.form = document.getElementById("form-cartorio");
    
    if (this.modal && !this.bsModal) {
      this.bsModal = new bootstrap.Modal(this.modal);
    }
  }

  /**
   * Renderiza a tabela de cartórios
   */
  async renderTable() {
    try {
      console.log(" [CartoriosUI] Renderizando tabela...");
      
      this.ensureElements();
      
      const cartorios = await cartoriosService.getAllCartorios();
      console.log(` [CartoriosUI] ${cartorios.length} cartórios encontrados`);
      
      // Atualiza contador
      const countBadge = document.getElementById("cartorios-count");
      if (countBadge) {
        countBadge.textContent = `${cartorios.length} ${cartorios.length === 1 ? 'cartório' : 'cartórios'}`;
      }

      if (!this.tableBody) {
        console.error(" [CartoriosUI] tableBody não encontrado!");
        return;
      }

      if (cartorios.length === 0) {
        this.tableBody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center text-muted py-4">
              <i class="bi bi-inbox fs-1 d-block mb-2"></i>
              Nenhum cartório cadastrado
            </td>
          </tr>
        `;
        return;
      }

      this.tableBody.innerHTML = cartorios
        .map(
          (c) => `
        <tr>
          <td><strong>${c.nome}</strong></td>
          <td>${c.cidade || '-'}</td>
          <td>${c.uf || '-'}</td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline-primary me-1" onclick="window.cartoriosUI.editCartorio('${c.id}')" title="Editar">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="window.cartoriosUI.deleteCartorio('${c.id}', '${c.nome}')" title="Excluir">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      `
        )
        .join("");
    } catch (error) {
      console.error(" Erro ao renderizar tabela:", error);
      showNotification("Erro ao carregar cartórios", "error");
    }
  }

  /**
   * Abre o modal para criar novo cartório
   */
  openModalForCreate() {
    this.ensureElements();
    this.currentEditId = null;
    this.form.reset();
    document.getElementById("cartorio-id").value = "";
    document.getElementById("modal-cartorio-admin-title").innerHTML =
      '<i class="bi bi-plus-circle me-2"></i>Novo Cartório';
    
    // Reset preview
    const previewNome = document.getElementById("preview-cartorio-nome");
    if (previewNome) previewNome.textContent = "NOME DO CARTÓRIO";
    
    this.bsModal.show();
  }

  /**
   * Abre o modal para editar um cartório
   * @param {string} id - ID do cartório
   */
  async editCartorio(id) {
    try {
      this.ensureElements();
      const cartorio = await cartoriosService.getCartorioById(id);
      
      if (!cartorio) {
        showNotification("Cartório não encontrado", "error");
        return;
      }

      this.currentEditId = id;
      document.getElementById("cartorio-id").value = id;
      document.getElementById("cartorio-nome").value = cartorio.nome || "";
      document.getElementById("cartorio-cidade").value = cartorio.cidade || "";
      document.getElementById("cartorio-uf").value = cartorio.uf || "PR";
      
      document.getElementById("modal-cartorio-admin-title").innerHTML =
        '<i class="bi bi-pencil me-2"></i>Editar Cartório';

      // Atualiza preview
      const previewNome = document.getElementById("preview-cartorio-nome");
      if (previewNome) previewNome.textContent = cartorio.nome;

      this.bsModal.show();
    } catch (error) {
      console.error(" Erro ao carregar cartório:", error);
      showNotification("Erro ao carregar cartório", "error");
    }
  }

  /**
   * Exclui um cartório
   * @param {string} id - ID do cartório
   * @param {string} nome - Nome do cartório (para confirmação)
   */
  async deleteCartorio(id, nome) {
    if (!confirm(`Deseja realmente excluir o cartório "${nome}"?`)) {
      return;
    }

    try {
      await cartoriosService.deleteCartorio(id);
      showNotification("Cartório excluído com sucesso", "success");
      await this.renderTable();
    } catch (error) {
      console.error(" Erro ao excluir cartório:", error);
      showNotification("Erro ao excluir cartório", "error");
    }
  }

  /**
   * Processa o submit do formulário
   */
  async handleSubmit() {
    try {
      const id = document.getElementById("cartorio-id").value;
      const nome = document.getElementById("cartorio-nome").value.trim();
      const cidade = document.getElementById("cartorio-cidade").value.trim();
      const uf = document.getElementById("cartorio-uf").value.trim();

      if (!nome) {
        showNotification("Nome do cartório é obrigatório", "error");
        return;
      }

      const data = { nome, cidade, uf };

      if (id) {
        // Atualização
        const result = await cartoriosService.updateCartorio(id, data);
        
        if (result.contratosAtualizados > 0) {
          showNotification(
            `Cartório atualizado com sucesso! ${result.contratosAtualizados} ${result.contratosAtualizados === 1 ? 'contrato foi atualizado' : 'contratos foram atualizados'} com o novo nome.`, 
            "success"
          );
        } else {
          showNotification("Cartório atualizado com sucesso", "success");
        }
      } else {
        // Criação
        await cartoriosService.createCartorio(data);
        showNotification("Cartório criado com sucesso", "success");
      }

      this.bsModal.hide();
      await this.renderTable();
      
      // Notifica o inlineSuggestFields para atualizar
      if (window.inlineSuggestFields) {
        window.inlineSuggestFields.refreshCartorios();
      }
    } catch (error) {
      console.error(" Erro ao salvar cartório:", error);
      showNotification(error.message || "Erro ao salvar cartório", "error");
    }
  }

  /**
   * Importa cartórios de contratos existentes
   */
  async importFromContracts() {
    if (!confirm("Deseja importar cartórios de contratos existentes?\n\nIsso adicionará cartórios que ainda não estão cadastrados.")) {
      return;
    }

    try {
      const count = await cartoriosService.importFromContracts();
      if (count > 0) {
        showNotification(`${count} cartórios importados com sucesso`, "success");
        await this.renderTable();
      } else {
        showNotification("Nenhum cartório novo encontrado para importar", "info");
      }
    } catch (error) {
      console.error(" Erro ao importar cartórios:", error);
      showNotification("Erro ao importar cartórios", "error");
    }
  }
}

// Instância singleton
const cartoriosUI = new CartoriosUI();

// Expõe globalmente para os botões inline e serviços
window.cartoriosUI = cartoriosUI;
window.cartoriosService = cartoriosService;

// Inicializa quando DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => cartoriosUI.init(), 500);
});

// Exporta instância singleton
export { cartoriosUI };
export default cartoriosUI;
