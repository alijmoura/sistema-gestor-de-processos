/**
 * @file cartoriosService.js
 * @description Serviço para gerenciar cartórios no Firestore.
 * Permite criar, ler, atualizar e excluir cartórios de registro de imóveis.
 */

import { db } from "./auth.js";

const COLLECTION_NAME = "cartorios";

// Lista de cartórios padrão para inicialização
const CARTORIOS_PADRAO = [
  { codigo: "1RI-LON", nome: "1º RI LONDRINA", cidade: "LONDRINA", uf: "PR" },
  { codigo: "2RI-LON", nome: "2º RI LONDRINA", cidade: "LONDRINA", uf: "PR" },
  { codigo: "1RI-SJP", nome: "1º RI SÃO JOSÉ DOS PINHAIS", cidade: "SÃO JOSÉ DOS PINHAIS", uf: "PR" },
  { codigo: "2RI-SJP", nome: "2º RI SÃO JOSÉ DOS PINHAIS", cidade: "SÃO JOSÉ DOS PINHAIS", uf: "PR" },
  { codigo: "1RI-CWB", nome: "1º RI CURITIBA", cidade: "CURITIBA", uf: "PR" },
  { codigo: "2RI-CWB", nome: "2º RI CURITIBA", cidade: "CURITIBA", uf: "PR" },
  { codigo: "3RI-CWB", nome: "3º RI CURITIBA", cidade: "CURITIBA", uf: "PR" },
  { codigo: "4RI-CWB", nome: "4º RI CURITIBA", cidade: "CURITIBA", uf: "PR" },
  { codigo: "5RI-CWB", nome: "5º RI CURITIBA", cidade: "CURITIBA", uf: "PR" },
  { codigo: "6RI-CWB", nome: "6º RI CURITIBA", cidade: "CURITIBA", uf: "PR" },
  { codigo: "7RI-CWB", nome: "7º RI CURITIBA", cidade: "CURITIBA", uf: "PR" },
  { codigo: "8RI-CWB", nome: "8º RI CURITIBA", cidade: "CURITIBA", uf: "PR" },
  { codigo: "9RI-CWB", nome: "9º RI CURITIBA", cidade: "CURITIBA", uf: "PR" },
  { codigo: "RI-ARA", nome: "RI ARAUCARIA", cidade: "ARAUCÁRIA", uf: "PR" },
  { codigo: "RI-CLA", nome: "RI CAMPO LARGO", cidade: "CAMPO LARGO", uf: "PR" },
  { codigo: "RI-FRG", nome: "RI FAZ. RIO GRANDE", cidade: "FAZENDA RIO GRANDE", uf: "PR" },
  { codigo: "RI-PIN", nome: "RI PINHAIS", cidade: "PINHAIS", uf: "PR" },
  { codigo: "RI-ALM", nome: "RI ALM.TAMANDARÉ", cidade: "ALMIRANTE TAMANDARÉ", uf: "PR" },
  { codigo: "RI-PIR", nome: "RI PIRAQUARA", cidade: "PIRAQUARA", uf: "PR" },
  { codigo: "RI-COL", nome: "RI COLOMBO", cidade: "COLOMBO", uf: "PR" },
  { codigo: "RI-CMA", nome: "RI CAMPO MAGRO", cidade: "CAMPO MAGRO", uf: "PR" },
  { codigo: "RI-CON", nome: "RI CONTENDA", cidade: "CONTENDA", uf: "PR" },
  { codigo: "RI-LAP", nome: "RI LAPA", cidade: "LAPA", uf: "PR" },
  { codigo: "RI-QBA", nome: "RI QUATRO BARRAS", cidade: "QUATRO BARRAS", uf: "PR" },
  { codigo: "RI-CGS", nome: "RI CAMPINA GRANDE DO SUL", cidade: "CAMPINA GRANDE DO SUL", uf: "PR" },
  { codigo: "RI-RNE", nome: "RI RIO NEGRO", cidade: "RIO NEGRO", uf: "PR" },
  { codigo: "RI-BOC", nome: "RI BOCAIÚVA DO SUL", cidade: "BOCAIÚVA DO SUL", uf: "PR" },
  { codigo: "RI-CAZ", nome: "RI CERRO AZUL", cidade: "CERRO AZUL", uf: "PR" },
  { codigo: "RI-RBS", nome: "RI RIO BRANCO DO SUL", cidade: "RIO BRANCO DO SUL", uf: "PR" },
  { codigo: "RI-MAT", nome: "RI MATINHOS", cidade: "MATINHOS", uf: "PR" },
  { codigo: "RI-POP", nome: "RI PONTAL DO PARANÁ", cidade: "PONTAL DO PARANÁ", uf: "PR" },
  { codigo: "RI-PAR", nome: "RI PARANAGUA", cidade: "PARANAGUÁ", uf: "PR" },
  { codigo: "RI-CAC", nome: "RI CACHOEIRINHA/RS", cidade: "CACHOEIRINHA", uf: "RS" },
  { codigo: "3RI-POA", nome: "3° RI PORTO ALEGRE", cidade: "PORTO ALEGRE", uf: "RS" }
];

/**
 * Classe de serviço para gerenciar cartórios
 */
class CartoriosService {
  constructor() {
    this.cache = null;
    this.cacheTimestamp = null;
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Inicialização removida - cartórios agora são gerenciados manualmente
   */

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
   * Retorna todos os cartórios ordenados por nome
   * @returns {Promise<Array>} Lista de cartórios
   */
  async getAllCartorios() {
    if (this.isCacheValid()) {
      return this.cache;
    }

    try {
      const snapshot = await db.collection(COLLECTION_NAME)
        .orderBy("nome", "asc")
        .get();
      
      const cartorios = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      this.cache = cartorios;
      this.cacheTimestamp = Date.now();
      
      return cartorios;
    } catch (error) {
      console.error(" Erro ao buscar cartórios:", error);
      throw error;
    }
  }

  /**
   * Retorna cartórios para select/autocomplete
   * @returns {Promise<Array<string>>} Lista de nomes de cartórios
   */
  async getCartoriosForSelect() {
    const cartorios = await this.getAllCartorios();
    return cartorios
      .filter(c => c.ativo !== false)
      .map(c => c.nome);
  }

  /**
   * Retorna um cartório específico por ID
   * @param {string} id - ID do cartório
   * @returns {Promise<Object|null>} Dados do cartório ou null
   */
  async getCartorioById(id) {
    try {
      const doc = await db.collection(COLLECTION_NAME).doc(id).get();
      
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      return null;
    } catch (error) {
      console.error(" Erro ao buscar cartório:", error);
      throw error;
    }
  }

  /**
   * Cria um novo cartório
   * @param {Object} data - Dados do cartório { codigo, nome, cidade, uf }
   * @returns {Promise<string>} ID do cartório criado
   */
  async createCartorio(data) {
    try {
      // Validação
      if (!data.nome) {
        throw new Error("Nome é obrigatório");
      }

      // Verifica se já existe cartório com o mesmo nome
      const cartorios = await this.getAllCartorios();
      const exists = cartorios.some(c => 
        c.nome.toLowerCase().trim() === data.nome.toLowerCase().trim()
      );
      
      if (exists) {
        throw new Error(`Já existe um cartório com o nome "${data.nome}"`);
      }

      const cartorioData = {
        codigo: (data.codigo || '').trim().toUpperCase(),
        nome: data.nome.trim().toUpperCase(),
        cidade: (data.cidade || '').trim().toUpperCase(),
        uf: (data.uf || 'PR').trim().toUpperCase(),
        ativo: data.ativo !== undefined ? data.ativo : true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await db.collection(COLLECTION_NAME).add(cartorioData);
      this.invalidateCache();
      
      console.log(` Cartório criado: ${cartorioData.nome}`);
      return docRef.id;
    } catch (error) {
      console.error(" Erro ao criar cartório:", error);
      throw error;
    }
  }

  /**
   * Cria ou atualiza um cartório (usado para inicialização)
   * @param {Object} data - Dados do cartório
   * @returns {Promise<string>} ID do cartório
   */
  async createOrUpdateCartorio(data) {
    try {
      if (!data.nome) {
        throw new Error("Nome do cartório é obrigatório");
      }

      // Busca se já existe um cartório com este nome
      const cartorios = await this.getAllCartorios();
      const existing = cartorios.find(c => 
        c.nome.toLowerCase().trim() === data.nome.toLowerCase().trim()
      );
      
      const cartorioData = {
        codigo: (data.codigo || '').trim().toUpperCase(),
        nome: data.nome.trim().toUpperCase(),
        cidade: (data.cidade || '').trim().toUpperCase(),
        uf: (data.uf || 'PR').trim().toUpperCase(),
        ativo: data.ativo !== undefined ? data.ativo : true,
        updatedAt: new Date()
      };

      if (existing) {
        // Atualiza o existente
        await db.collection(COLLECTION_NAME).doc(existing.id).update(cartorioData);
        this.invalidateCache();
        return existing.id;
      } else {
        // Cria novo
        cartorioData.createdAt = new Date();
        const docRef = await db.collection(COLLECTION_NAME).add(cartorioData);
        this.invalidateCache();
        return docRef.id;
      }
    } catch (error) {
      console.error(" Erro ao criar/atualizar cartório:", error);
      throw error;
    }
  }

  /**
   * Atualiza um cartório existente e propaga mudanças para contratos
   * @param {string} id - ID do cartório
   * @param {Object} data - Dados para atualizar
   * @returns {Promise<Object>} Resultado com estatísticas da atualização
   */
  async updateCartorio(id, data) {
    try {
      // Busca o cartório atual para comparar o nome
      const cartorioAtual = await this.getCartorioById(id);
      if (!cartorioAtual) {
        throw new Error("Cartório não encontrado");
      }

      const updateData = {
        ...data,
        updatedAt: new Date()
      };

      // Normaliza campos de texto
      if (updateData.nome) updateData.nome = updateData.nome.trim().toUpperCase();
      if (updateData.codigo) updateData.codigo = updateData.codigo.trim().toUpperCase();
      if (updateData.cidade) updateData.cidade = updateData.cidade.trim().toUpperCase();
      if (updateData.uf) updateData.uf = updateData.uf.trim().toUpperCase();

      // Verifica se o nome mudou
      const nomeAntigo = cartorioAtual.nome;
      const nomeNovo = updateData.nome || nomeAntigo;
      const nomeMudou = nomeAntigo !== nomeNovo;

      // Atualiza o cartório
      await db.collection(COLLECTION_NAME).doc(id).update(updateData);
      this.invalidateCache();
      
      console.log(` Cartório ${id} atualizado`);

      // Se o nome mudou, propaga para todos os contratos
      let contratosAtualizados = 0;
      if (nomeMudou) {
        console.log(` Nome do cartório mudou de "${nomeAntigo}" para "${nomeNovo}". Propagando para contratos...`);
        
        try {
          // Busca todos os contratos com o nome antigo
          const contratosSnapshot = await db.collection("contratos")
            .where("cartorio", "==", nomeAntigo)
            .get();
          
          console.log(` ${contratosSnapshot.size} contratos encontrados com o cartório "${nomeAntigo}"`);
          
          // Atualiza cada contrato
          const batch = db.batch();
          contratosSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { 
              cartorio: nomeNovo,
              updatedAt: new Date()
            });
            contratosAtualizados++;
          });
          
          if (contratosAtualizados > 0) {
            await batch.commit();
            console.log(` ${contratosAtualizados} contratos atualizados com o novo nome do cartório`);
          }
        } catch (propagationError) {
          console.error(" Erro ao propagar mudança de nome para contratos:", propagationError);
          // Não lança erro - a atualização do cartório já foi feita
        }
      }

      return {
        success: true,
        nomeMudou,
        contratosAtualizados
      };
    } catch (error) {
      console.error(" Erro ao atualizar cartório:", error);
      throw error;
    }
  }

  /**
   * Exclui um cartório
   * @param {string} id - ID do cartório
   * @returns {Promise<void>}
   */
  async deleteCartorio(id) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).delete();
      this.invalidateCache();
      
      console.log(` Cartório ${id} excluído`);
    } catch (error) {
      console.error(" Erro ao excluir cartório:", error);
      throw error;
    }
  }

  /**
   * Busca cartórios por termo
   * @param {string} term - Termo de busca
   * @returns {Promise<Array>} Lista de cartórios filtrados
   */
  async searchCartorios(term) {
    const cartorios = await this.getAllCartorios();
    const termLower = term.toLowerCase().trim();
    
    return cartorios.filter(c => 
      c.nome.toLowerCase().includes(termLower) ||
      (c.cidade && c.cidade.toLowerCase().includes(termLower)) ||
      (c.codigo && c.codigo.toLowerCase().includes(termLower))
    );
  }

  /**
   * Importação automática removida - use o botão 'Importar dos Contratos' manualmente
   */

  /**
   * Força importação manual de cartórios dos contratos (usado para migração única)
   */
  async forceImportFromContracts() {
    try {
      console.log(" Forçando importação de cartórios dos contratos...");
      
      const contracts = window.appState?.allContracts || [];
      
      if (contracts.length === 0) {
        throw new Error("Nenhum contrato encontrado. Aguarde o carregamento completo dos contratos.");
      }

      const cartoriosExistentes = await this.getAllCartorios();
      const nomesExistentes = new Set(cartoriosExistentes.map(c => c.nome.toLowerCase()));
      
      const cartoriosNovos = new Set();
      const cartoriosPorContrato = new Map();
      
      contracts.forEach(contract => {
        if (contract.cartorio) {
          const nome = contract.cartorio.trim().toUpperCase();
          if (nome) {
            if (!cartoriosPorContrato.has(nome)) {
              cartoriosPorContrato.set(nome, []);
            }
            cartoriosPorContrato.get(nome).push(contract.id);
            
            if (!nomesExistentes.has(nome.toLowerCase())) {
              cartoriosNovos.add(nome);
            }
          }
        }
      });

      console.log(` Total de ${cartoriosPorContrato.size} cartórios únicos em ${contracts.length} contratos`);
      console.log(` ${cartoriosNovos.size} cartórios novos para importar`);
      console.log(` ${cartoriosExistentes.length} cartórios já cadastrados`);

      let count = 0;
      for (const nome of cartoriosNovos) {
        try {
          await this.createOrUpdateCartorio({ nome });
          count++;
          console.log(`   Importado: ${nome} (usado em ${cartoriosPorContrato.get(nome).length} contratos)`);
        } catch (err) {
          if (!err.message.includes('já existe')) {
            console.error(`   Erro ao importar ${nome}:`, err.message);
          }
        }
      }

      this.invalidateCache();
      
      console.log(`\n Importação concluída: ${count} novos cartórios adicionados`);
      console.log(` Total agora: ${cartoriosExistentes.length + count} cartórios cadastrados`);
      
      return {
        imported: count,
        total: cartoriosExistentes.length + count,
        existing: cartoriosExistentes.length,
        cartoriosNovos: Array.from(cartoriosNovos)
      };
    } catch (error) {
      console.error(" Erro ao forçar importação de cartórios:", error);
      throw error;
    }
  }

  /**
   * Importa cartórios de contratos existentes (via botão UI)
   * Versão simplificada que chama a função forceImportFromContracts
   * @returns {Promise<number>} Número de cartórios importados
   */
  async importFromContracts() {
    try {
      console.log(" [CartoriosService] Importando cartórios dos contratos...");
      
      const result = await this.forceImportFromContracts();
      
      console.log(` [CartoriosService] Importação concluída: ${result.imported} novos cartórios`);
      
      // Invalidar cache para forçar reload
      this.cache.clear();
      
      return result.imported;
    } catch (error) {
      console.error(" [CartoriosService] Erro ao importar cartórios:", error);
      throw error;
    }
  }
}

// Instância singleton
const cartoriosService = new CartoriosService();

// Expõe globalmente para debug e uso no console
window.cartoriosService = cartoriosService;

// Função helper para importação manual via console
window.forceImportCartoriosFromContracts = async () => {
  try {
    const result = await cartoriosService.forceImportFromContracts();
    console.log(' Resultado da importação:', result);
    return result;
  } catch (error) {
    console.error(' Erro na importação:', error);
    throw error;
  }
};

// Exporta instância singleton
export { cartoriosService, CARTORIOS_PADRAO };
export default cartoriosService;
