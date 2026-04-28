import { db, auth } from "./auth.js";
import cacheService from "./cacheService.js";
import { DEFAULT_USER_PERMISSIONS } from "./workflowConfig.js";

class UserPermissionService {
  constructor() {
    this.collection = db.collection('user_permissions');
    this.cachePrefix = 'user_perm_v2_';
    this.legacyCachePrefix = 'user_perm_';
  }

  normalizeWorkflowId(value) {
    return value === undefined || value === null
      ? ''
      : String(value).trim().toLowerCase();
  }

  /**
   * Busca as permissões de um usuário
   * @param {string} uid 
   */
  async getUserPermissions(uid) {
    if (!uid) return DEFAULT_USER_PERMISSIONS;

    const cacheKey = `${this.cachePrefix}${uid}`;
    const legacyCacheKey = `${this.legacyCachePrefix}${uid}`;

    const legacyCached = cacheService.getSync(legacyCacheKey, 'user_permissions');
    if (legacyCached && !cacheService.getSync(cacheKey, 'user_permissions')) {
      cacheService.set(cacheKey, legacyCached, 'user_permissions');
    }

    return await cacheService.get(
      cacheKey,
      async () => {
        const doc = await this.collection.doc(uid).get();
        if (!doc.exists) {
          return DEFAULT_USER_PERMISSIONS;
        }
        const normalized = { ...DEFAULT_USER_PERMISSIONS, ...doc.data() };
        cacheService.set(legacyCacheKey, normalized, 'user_permissions');
        return normalized;
      },
      'user_permissions' // Tag para invalidação
    );
  }

  /**
   * Atualiza as permissões de um usuário
   * @param {string} uid 
   * @param {object} permissions 
   */
  async updateUserPermissions(uid, permissions) {
    if (!auth.currentUser) throw new Error('Usuário não autenticado');
    
    // TODO: Verificar se o usuário atual é admin antes de permitir update
    
    await this.collection.doc(uid).set({
      ...permissions,
      updatedAt: new Date(),
      updatedBy: auth.currentUser.email
    }, { merge: true });

    cacheService.invalidate(`${this.cachePrefix}${uid}`);
    cacheService.invalidate(`${this.legacyCachePrefix}${uid}`);
  }

  /**
   * Verifica se o usuário tem acesso a um workflow específico
   * @param {string} uid 
   * @param {string} workflowId 
   */
  async canAccessWorkflow(uid, workflowId) {
    const perms = await this.getUserPermissions(uid);
    
    // Se for admin, tem acesso a tudo
    if (perms.role === 'admin') return true;
    
    // Se allowedWorkflows estiver vazio ou indefinido, assume acesso total (comportamento legado)
    if (!perms.allowedWorkflows || perms.allowedWorkflows.length === 0) return true;

    const normalizedAllowed = perms.allowedWorkflows.map((wf) => this.normalizeWorkflowId(wf));
    const normalizedWorkflow = this.normalizeWorkflowId(workflowId);
    
    return normalizedAllowed.includes(normalizedWorkflow);
  }

  /**
   * Verifica se o usuário tem acesso a um contrato baseado na construtora/vendedor
   * @param {string} uid 
   * @param {string} vendorName 
   */
  async canAccessVendor(uid, vendorName) {
    const perms = await this.getUserPermissions(uid);
    
    if (perms.role === 'admin') return true;
    if (!perms.allowedVendors || perms.allowedVendors.length === 0) return true;
    
    return perms.allowedVendors.includes(vendorName);
  }

  /**
   * Retorna o filtro de visibilidade para consultas Firestore
   * @param {string} uid 
   */
  async getVisibilityFilters(uid) {
    const perms = await this.getUserPermissions(uid);
    return {
      workflows: perms.allowedWorkflows || [],
      vendors: perms.allowedVendors || [],
      minStage: perms.minStageVisibility
    };
  }

  /**
   * Filtra uma lista de contratos com base nas permissões
   * @param {Array} contracts 
   * @param {Object} permissions 
   */
  filterContracts(contracts, permissions) {
    if (!permissions) return contracts;
    if (permissions.role === 'admin') return contracts;

    const normalizedAllowedWorkflows = (permissions.allowedWorkflows || [])
      .map((wf) => this.normalizeWorkflowId(wf));

    return contracts.filter(contract => {
      // 1. Filtro de Workflow
      if (normalizedAllowedWorkflows.length > 0) {
         //  CORREÇÃO: Verifica workflowId (novo) OU workflowType (legado)
         // Se o contrato não tem nenhum dos dois, assume 'individual' (padrão legado)
         const contractWorkflow = this.normalizeWorkflowId(
           contract.workflowId ||
           contract.workflowID ||
           contract.workflowid ||
           contract.workFlowId ||
           contract.workflowType ||
           contract.workflowtype ||
           'individual'
         ) || 'individual';
         
         if (!normalizedAllowedWorkflows.includes(contractWorkflow)) {
           return false;
         }
      }

      // 2. Filtro de Vendedor
      if (permissions.allowedVendors && permissions.allowedVendors.length > 0) {
        const vendor = contract.vendedorConstrutora;
        // Se o contrato não tem vendedor definido, ele deve ser ocultado se houver restrição?
        // Geralmente sim. Se o usuário só pode ver "Construtora X", ele não deve ver contratos sem construtora.
        if (!vendor || !permissions.allowedVendors.includes(vendor)) {
          return false;
        }
      }

      return true;
    });
  }
}

const userPermissionService = new UserPermissionService();
export default userPermissionService;
