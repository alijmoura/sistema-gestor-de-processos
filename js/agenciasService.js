/**
 * @file agenciasService.js
 * @description Serviço para gerenciar agências CEF no Firestore.
 * Permite criar, ler, atualizar e excluir agências da Caixa Econômica Federal.
 */

import { db } from "./auth.js";
import { AGENCIAS_CEF } from "./config.js";

const COLLECTION_NAME = "agencias";

/**
 * Classe de serviço para gerenciar agências CEF
 */
class AgenciasService {
  constructor() {
    this.cache = null;
    this.cacheTimestamp = null;
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Inicializa as agências padrão se a coleção estiver vazia
   */
  async initializeDefaultAgencias() {
    try {
      const agencias = await this.getAllAgencias();
      
      if (agencias.length === 0) {
        console.log(" Inicializando agências padrão...");
        
        for (const agenciaCompleta of AGENCIAS_CEF) {
          // Extrair código e nome do formato "CEF AG XXXX - NOME"
          const match = agenciaCompleta.match(/CEF AG (\d+) - (.+)/);
          if (match) {
            const [, codigo, nome] = match;
            await this.createAgencia({ codigo, nome });
          }
        }
        
        console.log(` ${AGENCIAS_CEF.length} agências padrão inicializadas`);
        this.invalidateCache();
      }
    } catch (error) {
      console.error(" Erro ao inicializar agências padrão:", error);
    }
  }

  /**
   * Invalida o cache
   */
  invalidateCache() {
    this.cache = null;
    this.cacheTimestamp = null;
  }

  /**
   * Verifica se o cache é válido
   */
  isCacheValid() {
    if (!this.cache || !this.cacheTimestamp) return false;
    return Date.now() - this.cacheTimestamp < this.CACHE_TTL;
  }

  /**
   * Retorna todas as agências ordenadas por código
   * @returns {Promise<Array>} Lista de agências
   */
  async getAllAgencias() {
    if (this.isCacheValid()) {
      return this.cache;
    }

    try {
      const snapshot = await db.collection(COLLECTION_NAME)
        .orderBy("codigo", "asc")
        .get();
      
      const agencias = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      this.cache = agencias;
      this.cacheTimestamp = Date.now();
      
      return agencias;
    } catch (error) {
      console.error(" Erro ao buscar agências:", error);
      throw error;
    }
  }

  /**
   * Retorna uma agência específica por ID
   * @param {string} id - ID da agência
   * @returns {Promise<Object|null>} Dados da agência ou null
   */
  async getAgenciaById(id) {
    try {
      const doc = await db.collection(COLLECTION_NAME).doc(id).get();
      
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      return null;
    } catch (error) {
      console.error(" Erro ao buscar agência:", error);
      throw error;
    }
  }

  /**
   * Cria uma nova agência
   * @param {Object} data - Dados da agência { codigo, nome }
   * @returns {Promise<string>} ID da agência criada
   */
  async createAgencia(data) {
    try {
      // Validação
      if (!data.codigo || !data.nome) {
        throw new Error("Código e nome são obrigatórios");
      }

      // Verifica se já existe agência com o mesmo código
      const agencias = await this.getAllAgencias();
      const exists = agencias.some(ag => ag.codigo === data.codigo.trim());
      
      if (exists) {
        throw new Error(`Já existe uma agência com o código ${data.codigo}`);
      }

      const agenciaData = {
        codigo: data.codigo.trim(),
        nome: data.nome.trim().toUpperCase(),
        ativo: data.ativo !== undefined ? data.ativo : true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await db.collection(COLLECTION_NAME).add(agenciaData);
      this.invalidateCache();
      
      console.log(` Agência criada: CEF AG ${agenciaData.codigo} - ${agenciaData.nome}`);
      return docRef.id;
    } catch (error) {
      console.error(" Erro ao criar agência:", error);
      throw error;
    }
  }

  /**
   * Atualiza uma agência existente
   * @param {string} id - ID da agência
   * @param {Object} data - Dados para atualizar { codigo, nome }
   * @returns {Promise<void>}
   */
  async updateAgencia(id, data) {
    try {
      // Validação
      if (!data.codigo || !data.nome) {
        throw new Error("Código e nome são obrigatórios");
      }

      // Verifica se já existe outra agência com o mesmo código
      const agencias = await this.getAllAgencias();
      const exists = agencias.some(ag => ag.id !== id && ag.codigo === data.codigo.trim());
      
      if (exists) {
        throw new Error(`Já existe outra agência com o código ${data.codigo}`);
      }

      const updateData = {
        codigo: data.codigo.trim(),
        nome: data.nome.trim().toUpperCase(),
        ativo: data.ativo !== undefined ? data.ativo : true,
        updatedAt: new Date()
      };

      await db.collection(COLLECTION_NAME).doc(id).update(updateData);
      this.invalidateCache();
      
      console.log(` Agência atualizada: CEF AG ${updateData.codigo} - ${updateData.nome}`);
    } catch (error) {
      console.error(" Erro ao atualizar agência:", error);
      throw error;
    }
  }

  /**
   * Exclui uma agência
   * @param {string} id - ID da agência
   * @returns {Promise<void>}
   */
  async deleteAgencia(id) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).delete();
      this.invalidateCache();
      
      console.log(` Agência excluída: ${id}`);
    } catch (error) {
      console.error(" Erro ao excluir agência:", error);
      throw error;
    }
  }

  /**
   * Retorna lista formatada para uso em selects
   * @returns {Promise<Array<string>>} Lista formatada ["CEF AG 0374 - MERCES", ...]
   */
  async getAgenciasForSelect() {
    const agencias = await this.getAllAgencias();
    return agencias.map(ag => `CEF AG ${ag.codigo} - ${ag.nome}`);
  }

  /**
   * Migra agências do config.js para o Firestore (apenas uma vez)
   */
  async migrateFromConfig() {
    try {
      const agencias = await this.getAllAgencias();
      
      if (agencias.length > 0) {
        console.log(" Agências já existem no Firestore. Migração não necessária.");
        return;
      }

      await this.initializeDefaultAgencias();
    } catch (error) {
      console.error(" Erro na migração:", error);
      throw error;
    }
  }

  /**
   * Cadastra múltiplas agências de uma vez
   * @param {Array<string>} agenciasCompletas - Array de strings no formato "CEF AG XXXX - NOME"
   * @returns {Promise<Object>} Resultado do cadastro { success: number, errors: Array }
   */
  async bulkCreateAgencias(agenciasCompletas) {
    const results = { success: 0, errors: [], skipped: 0 };
    
    console.log(` Iniciando cadastro em lote de ${agenciasCompletas.length} agências...`);

    for (const agenciaCompleta of agenciasCompletas) {
      try {
        // Extrair código e nome do formato "CEF AG XXXX - NOME"
        const match = agenciaCompleta.match(/CEF AG (\d+) - (.+)/);
        if (!match) {
          results.errors.push({ agencia: agenciaCompleta, error: "Formato inválido" });
          continue;
        }

        const [, codigo, nome] = match;
        
        // Verifica se já existe
        const agencias = await this.getAllAgencias();
        const exists = agencias.some(ag => ag.codigo === codigo.trim());
        
        if (exists) {
          console.log(` Agência ${codigo} já existe, pulando...`);
          results.skipped++;
          continue;
        }

        await this.createAgencia({ codigo, nome, ativo: true });
        results.success++;
        console.log(` ${results.success}/${agenciasCompletas.length} - CEF AG ${codigo} - ${nome}`);
      } catch (error) {
        results.errors.push({ agencia: agenciaCompleta, error: error.message });
        console.error(` Erro ao cadastrar ${agenciaCompleta}:`, error.message);
      }
    }

    console.log(`\n Resultado do cadastro em lote:`);
    console.log(`    Sucesso: ${results.success}`);
    console.log(`    Puladas (já existem): ${results.skipped}`);
    console.log(`    Erros: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      console.log(`\n Agências com erro:`, results.errors);
    }

    return results;
  }

  /**
   * Remove TODAS as agências (use com cuidado!)
   * @returns {Promise<number>} Quantidade de agências removidas
   */
  async deleteAllAgencias() {
    try {
      const agencias = await this.getAllAgencias();
      let deleted = 0;

      for (const agencia of agencias) {
        await this.deleteAgencia(agencia.id);
        deleted++;
      }

      console.log(` ${deleted} agências removidas`);
      return deleted;
    } catch (error) {
      console.error(" Erro ao remover agências:", error);
      throw error;
    }
  }
}

// Exporta instância singleton
const agenciasService = new AgenciasService();
export default agenciasService;

// Expõe globalmente para debug
if (typeof window !== "undefined") {
  window.agenciasService = agenciasService;
}
