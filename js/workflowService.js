import { db, auth } from "./auth.js";
import cacheService from "./cacheService.js";
import { DEFAULT_WORKFLOWS } from "./workflowConfig.js";

class WorkflowService {
  constructor() {
    this.collection = db.collection('workflows');
    this.cacheKey = 'workflows_config';
  }

  /**
   * Inicializa os workflows padrão se não existirem
   */
  async initializeDefaults() {
    try {
      const snapshot = await this.collection.get();
      if (snapshot.empty) {
        const batch = db.batch();
        DEFAULT_WORKFLOWS.forEach(wf => {
          const docRef = this.collection.doc(wf.id);
          batch.set(docRef, {
            ...wf,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        });
        await batch.commit();
        console.log(' Workflows padrão inicializados');
        cacheService.invalidate(this.cacheKey);
      }
    } catch (error) {
      console.error('Erro ao inicializar workflows:', error);
    }
  }

  /**
   * Busca todos os workflows configurados
   * @returns {Promise<Array>}
   */
  async getAllWorkflows() {
    return await cacheService.get(
      this.cacheKey,
      async () => {
        const snapshot = await this.collection.where('active', '==', true).get();
        if (snapshot.empty) {
          await this.initializeDefaults();
          return DEFAULT_WORKFLOWS;
        }
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      'workflows'
    );
  }

  /**
   * Busca um workflow específico pelo ID
   * @param {string} id 
   */
  async getWorkflowById(id) {
    const workflows = await this.getAllWorkflows();
    return workflows.find(w => w.id === id);
  }

  /**
   * Salva ou atualiza um workflow
   * @param {object} workflowData 
   */
  async saveWorkflow(workflowData) {
    // Gera ID se não existir
    const id = workflowData.id || this.collection.doc().id;
    
    const docRef = this.collection.doc(id);
    const dataToSave = {
      ...workflowData,
      id: id,
      updatedAt: new Date(),
      updatedBy: auth.currentUser?.email || 'system'
    };

    if (!workflowData.createdAt) {
      dataToSave.createdAt = new Date();
    }

    await docRef.set(dataToSave, { merge: true });
    
    cacheService.invalidate(this.cacheKey);
    return dataToSave;
  }

  /**
   * Remove (arquiva) um workflow
   * @param {string} id 
   */
  async deleteWorkflow(id) {
    if (!auth.currentUser) throw new Error('Usuário não autenticado');
    
    // Soft delete
    await this.collection.doc(id).update({
      active: false,
      updatedAt: new Date(),
      updatedBy: auth.currentUser.email
    });
    cacheService.invalidate(this.cacheKey);
  }

  /**
   * Verifica se um status pertence a um workflow
   * @param {string} workflowId 
   * @param {string} statusName 
   */
  async isStatusInWorkflow(workflowId, statusName) {
    const workflow = await this.getWorkflowById(workflowId);
    if (!workflow) return false;
    return workflow.stages.includes(statusName);
  }
}

const workflowService = new WorkflowService();
export default workflowService;
