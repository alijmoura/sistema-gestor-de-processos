// ========================================
// INTEGRAÇÃO BADGE SERVICE COM FIRESTORE
// ========================================
// Adicione este código ao final do firestoreService.js

// Função auxiliar para disparar eventos de sincronização
function dispatchSyncEvent(eventName) {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent(eventName));

    if (window.__DEBUG__) {
      console.log(`[FirestoreService] Evento disparado: ${eventName}`);
    }
  }
}

// Wrapper para operações do Firestore que disparam eventos de sync
const firestoreOperationWrapper = {
  /**
   * Executa operação com indicadores de sincronização
   * @param {Function} operation - Função assíncrona a executar
   * @param {string} operationName - Nome da operação (para log)
   * @returns {Promise} Resultado da operação
   */
  async execute(operation, operationName = 'operation') {
    try {
      dispatchSyncEvent('firestore:syncing');
      const result = await operation();
      dispatchSyncEvent('firestore:synced');
      return result;
    } catch (error) {
      dispatchSyncEvent('firestore:error');
      console.error(`[FirestoreService] Erro em ${operationName}:`, error);
      throw error;
    }
  }
};

// EXEMPLO DE USO:
// Ao invés de:
//   const contracts = await getDocs(query);
// Use:
//   const contracts = await firestoreOperationWrapper.execute(
//     () => getDocs(query),
//     'getAllContracts'
//   );

// INSTRUÇÕES:
// 1. Encontre as principais funções de leitura/escrita no firestoreService.js:
//    - getAllContracts()
//    - getContractsByPage()
//    - createContract()
//    - updateContract()
//    - deleteContract()
//
// 2. Envolva as chamadas await do Firestore com o wrapper:
//    Antes: const snapshot = await getDocs(contractsRef);
//    Depois: const snapshot = await firestoreOperationWrapper.execute(
//              () => getDocs(contractsRef),
//              'getAllContracts'
//            );
//
// 3. Exporte o wrapper no final do arquivo:
export { firestoreOperationWrapper };

console.log(' [BadgeService Integration] Código de integração pronto para uso');
console.log(' Leia as instruções acima para integrar com firestoreService.js');
