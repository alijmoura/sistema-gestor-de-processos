/**
 * @file permissionsService.js
 * @description Serviço completo para gerenciamento de permissões granulares de usuários
 * Permite controlar visibilidade e edição de campos/módulos por usuário
 */

import { db, auth } from "./auth.js";
import cacheService from "./cacheService.js";

/**
 * Estrutura de permissões granulares por módulo/campo
 */
export const PERMISSION_MODULES = {
  CONTRACTS: 'contracts',
  DASHBOARD: 'dashboard',
  REPORTS: 'reports',
  WHATSAPP: 'whatsapp',
  CALENDAR: 'calendar',
  BACKUPS: 'backups',
  USERS: 'users',
  STATUS: 'status',
  WORKFLOWS: 'workflows',
  AGENCIAS: 'agencias',
  CARTORIOS: 'cartorios',
  PENDENCIAS: 'pendencias',
  APROVACOES: 'aprovacoes'
};

/**
 * Ações possíveis para cada módulo
 */
export const PERMISSION_ACTIONS = {
  VIEW: 'view',
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',
  EXPORT: 'export',
  IMPORT: 'import'
};

/**
 * Campos de contrato configuráveis
 */
export const CONTRACT_FIELDS = {
  // Dados básicos
  NUMERO_CONTRATO: 'numeroContrato',
  NOME_CLIENTE: 'nomeCliente',
  CPF: 'cpf',
  VENDEDOR_CONSTRUTORA: 'vendedorConstrutora',
  STATUS: 'status',
  WORKFLOW_ID: 'workflowId',
  DATA_ENTRADA: 'dataEntrada',
  DATA_VENCIMENTO: 'dataVencimento',
  DATA_REGISTRO: 'dataRegistro',
  VALOR_CONTRATO: 'valorContrato',
  VALOR_FINANCIAMENTO: 'valorFinanciamento',
  AGENCIA: 'agencia',
  CARTORIO: 'cartorio',
  OBSERVACOES: 'observacoes',
  ANEXOS: 'anexos',
  HISTORICO: 'historico'
};

/**
 * Níveis de permissão (herança hierárquica)
 */
export const PERMISSION_ROLES = {
  SUPER_ADMIN: 'super_admin',    // Acesso total irrestrito
  ADMIN: 'admin',                 // Acesso administrativo completo
  MANAGER: 'manager',             // Gerente com permissões amplas
  ANALYST: 'analyst',             // Analista com permissões limitadas
  VIEWER: 'viewer',               // Apenas visualização
  CUSTOM: 'custom'                // Permissões personalizadas
};

/**
 * Hierarquia de roles (para herança de permissões)
 */
const ROLE_HIERARCHY = {
  [PERMISSION_ROLES.SUPER_ADMIN]: 5,
  [PERMISSION_ROLES.ADMIN]: 4,
  [PERMISSION_ROLES.MANAGER]: 3,
  [PERMISSION_ROLES.ANALYST]: 2,
  [PERMISSION_ROLES.VIEWER]: 1,
  [PERMISSION_ROLES.CUSTOM]: 0
};

/**
 * Templates de permissões padrão por role
 */
export const DEFAULT_ROLE_PERMISSIONS = {
  [PERMISSION_ROLES.SUPER_ADMIN]: {
    modules: Object.values(PERMISSION_MODULES).reduce((acc, module) => {
      acc[module] = Object.values(PERMISSION_ACTIONS);
      return acc;
    }, {}),
    fields: Object.values(CONTRACT_FIELDS).reduce((acc, field) => {
      acc[field] = { view: true, edit: true };
      return acc;
    }, {}),
    allowedWorkflows: [],  // [] = todos
    allowedVendors: [],    // [] = todos
    allowedStatus: []      // [] = todos
  },
  
  [PERMISSION_ROLES.ADMIN]: {
    modules: {
      [PERMISSION_MODULES.CONTRACTS]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.CREATE, PERMISSION_ACTIONS.EDIT, PERMISSION_ACTIONS.DELETE, PERMISSION_ACTIONS.EXPORT],
      [PERMISSION_MODULES.DASHBOARD]: [PERMISSION_ACTIONS.VIEW],
      [PERMISSION_MODULES.REPORTS]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.EXPORT],
      [PERMISSION_MODULES.WHATSAPP]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.EDIT],
      [PERMISSION_MODULES.CALENDAR]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.CREATE, PERMISSION_ACTIONS.EDIT],
      [PERMISSION_MODULES.USERS]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.CREATE, PERMISSION_ACTIONS.EDIT],
      [PERMISSION_MODULES.STATUS]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.EDIT],
      [PERMISSION_MODULES.WORKFLOWS]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.EDIT],
      [PERMISSION_MODULES.AGENCIAS]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.CREATE, PERMISSION_ACTIONS.EDIT],
      [PERMISSION_MODULES.CARTORIOS]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.CREATE, PERMISSION_ACTIONS.EDIT],
      [PERMISSION_MODULES.PENDENCIAS]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.CREATE, PERMISSION_ACTIONS.EDIT, PERMISSION_ACTIONS.DELETE],
      [PERMISSION_MODULES.APROVACOES]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.CREATE, PERMISSION_ACTIONS.EDIT, PERMISSION_ACTIONS.DELETE, PERMISSION_ACTIONS.EXPORT, PERMISSION_ACTIONS.IMPORT]
    },
    fields: Object.values(CONTRACT_FIELDS).reduce((acc, field) => {
      acc[field] = { view: true, edit: true };
      return acc;
    }, {}),
    allowedWorkflows: [],
    allowedVendors: [],
    allowedStatus: []
  },
  
  [PERMISSION_ROLES.MANAGER]: {
    modules: {
      [PERMISSION_MODULES.CONTRACTS]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.CREATE, PERMISSION_ACTIONS.EDIT, PERMISSION_ACTIONS.EXPORT],
      [PERMISSION_MODULES.DASHBOARD]: [PERMISSION_ACTIONS.VIEW],
      [PERMISSION_MODULES.REPORTS]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.EXPORT],
      [PERMISSION_MODULES.WHATSAPP]: [PERMISSION_ACTIONS.VIEW],
      [PERMISSION_MODULES.CALENDAR]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.CREATE],
      [PERMISSION_MODULES.PENDENCIAS]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.CREATE, PERMISSION_ACTIONS.EDIT],
      [PERMISSION_MODULES.APROVACOES]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.CREATE, PERMISSION_ACTIONS.EDIT, PERMISSION_ACTIONS.EXPORT, PERMISSION_ACTIONS.IMPORT]
    },
    fields: Object.values(CONTRACT_FIELDS).reduce((acc, field) => {
      // Manager pode ver tudo mas não editar valores financeiros críticos
      const editRestricted = [CONTRACT_FIELDS.VALOR_CONTRATO, CONTRACT_FIELDS.VALOR_FINANCIAMENTO];
      acc[field] = { 
        view: true, 
        edit: !editRestricted.includes(field) 
      };
      return acc;
    }, {}),
    allowedWorkflows: [],
    allowedVendors: [],
    allowedStatus: []
  },
  
  [PERMISSION_ROLES.ANALYST]: {
    modules: {
      [PERMISSION_MODULES.CONTRACTS]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.EDIT],
      [PERMISSION_MODULES.DASHBOARD]: [PERMISSION_ACTIONS.VIEW],
      [PERMISSION_MODULES.CALENDAR]: [PERMISSION_ACTIONS.VIEW],
      [PERMISSION_MODULES.PENDENCIAS]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.CREATE],
      [PERMISSION_MODULES.APROVACOES]: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.CREATE, PERMISSION_ACTIONS.EDIT]
    },
    fields: Object.values(CONTRACT_FIELDS).reduce((acc, field) => {
      // Analista não pode editar dados críticos (mas PODE editar workflowId)
      const viewOnly = [
        CONTRACT_FIELDS.VALOR_CONTRATO, 
        CONTRACT_FIELDS.VALOR_FINANCIAMENTO,
        CONTRACT_FIELDS.HISTORICO,
        CONTRACT_FIELDS.VENDEDOR_CONSTRUTORA
      ];
      acc[field] = { 
        view: true, 
        edit: !viewOnly.includes(field) 
      };
      return acc;
    }, {}),
    allowedWorkflows: [],
    allowedVendors: [],
    allowedStatus: []
  },
  
  [PERMISSION_ROLES.VIEWER]: {
    modules: {
      [PERMISSION_MODULES.CONTRACTS]: [PERMISSION_ACTIONS.VIEW],
      [PERMISSION_MODULES.DASHBOARD]: [PERMISSION_ACTIONS.VIEW],
      [PERMISSION_MODULES.APROVACOES]: [PERMISSION_ACTIONS.VIEW]
    },
    fields: Object.values(CONTRACT_FIELDS).reduce((acc, field) => {
      acc[field] = { view: true, edit: false };
      return acc;
    }, {}),
    allowedWorkflows: [],
    allowedVendors: [],
    allowedStatus: []
  },
  
  [PERMISSION_ROLES.CUSTOM]: {
    modules: {},
    fields: {},
    allowedWorkflows: [],
    allowedVendors: [],
    allowedStatus: []
  }
};

class PermissionsService {
  constructor() {
    this.collection = db.collection('user_permissions');
    this.cachePrefix = 'user_perm_v2_';
    this.legacyCachePrefix = 'user_perm_';
  }

  /**
   * Busca permissões completas de um usuário
   * @param {string} uid 
   * @returns {Promise<Object>}
   */
  async getUserPermissions(uid) {
    if (!uid) {
      return this._getDefaultPermissions();
    }

    const cacheKey = `${this.cachePrefix}${uid}`;
    const legacyKey = `${this.legacyCachePrefix}${uid}`;

    // Migração transparente: reaproveita cache legado quando disponível.
    const legacyCached = cacheService.getSync(legacyKey, 'user_permissions');
    if (legacyCached && !cacheService.getSync(cacheKey, 'user_permissions')) {
      cacheService.set(cacheKey, legacyCached, 'user_permissions');
    }
    
    return await cacheService.get(
      cacheKey,
      async () => {
        const doc = await this.collection.doc(uid).get();
        
        if (!doc.exists) {
          // Não cria no cliente: a coleção user_permissions é administrada via regras/admin.
          const defaultPerms = {
            uid,
            role: PERMISSION_ROLES.ANALYST,
            ...DEFAULT_ROLE_PERMISSIONS[PERMISSION_ROLES.ANALYST],
            createdAt: null,
            updatedAt: null
          };

          console.warn(`[PermissionsService] user_permissions ausente para ${uid}. Usando permissões locais padrão de analyst até o provisionamento por um admin.`);
          cacheService.set(legacyKey, defaultPerms, 'user_permissions');
          return defaultPerms;
        }
        
        const data = doc.data();
        
        // Se o role mudou, mescla com o template padrão
        if (data.role && data.role !== PERMISSION_ROLES.CUSTOM) {
          const roleTemplate = DEFAULT_ROLE_PERMISSIONS[data.role] || {};
          const merged = {
            uid,
            ...roleTemplate,
            ...data,
            // Garante que campos personalizados sobrescrevem template
            modules: { ...roleTemplate.modules, ...data.modules },
            fields: { ...roleTemplate.fields, ...data.fields }
          };
          cacheService.set(legacyKey, merged, 'user_permissions');
          return merged;
        }
        
        const normalized = { uid, ...data };
        cacheService.set(legacyKey, normalized, 'user_permissions');
        return normalized;
      },
      'user_permissions'
    );
  }

  /**
   * Atualiza permissões de um usuário
   * @param {string} uid 
   * @param {Object} permissions 
   * @returns {Promise<void>}
   */
  async updateUserPermissions(uid, permissions) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Usuário não autenticado');
    }
    
    // Verifica se usuário atual tem permissão para alterar permissões
    const currentPerms = await this.getUserPermissions(currentUser.uid);
    if (!this.can(currentPerms, PERMISSION_MODULES.USERS, PERMISSION_ACTIONS.EDIT)) {
      throw new Error('Você não tem permissão para alterar permissões de usuários');
    }

    const updateData = {
      ...permissions,
      updatedAt: new Date(),
      updatedBy: currentUser.email || currentUser.uid
    };

    // Se role foi alterado e não é CUSTOM, aplica template
    if (permissions.role && permissions.role !== PERMISSION_ROLES.CUSTOM) {
      const roleTemplate = DEFAULT_ROLE_PERMISSIONS[permissions.role];
      if (roleTemplate) {
        Object.assign(updateData, {
          modules: roleTemplate.modules,
          fields: roleTemplate.fields
        });
      }
    }

    await this.collection.doc(uid).set(updateData, { merge: true });
    
    // Invalida cache
    cacheService.invalidate(`${this.cachePrefix}${uid}`);
    cacheService.invalidate(`${this.legacyCachePrefix}${uid}`);
    
    if (window.__DEBUG__) {
      console.log(' Permissões atualizadas:', uid, updateData);
    }
  }

  /**
   * Lista todos os usuários com suas permissões
   * @returns {Promise<Array>}
   */
  async listAllUserPermissions() {
    const snapshot = await this.collection.get();
    return snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data()
    }));
  }

  /**
   * Verifica se usuário pode executar ação em módulo
   * @param {Object} permissions - Objeto de permissões do usuário
   * @param {string} module - Nome do módulo
   * @param {string} action - Ação a verificar
   * @returns {boolean}
   */
  can(permissions, module, action) {
    if (!permissions) return false;
    
    // Super admin pode tudo
    if (permissions.role === PERMISSION_ROLES.SUPER_ADMIN) return true;
    
    const modulePerms = permissions.modules?.[module];
    if (!modulePerms || !Array.isArray(modulePerms)) return false;
    
    return modulePerms.includes(action);
  }

  /**
   * Verifica se usuário pode visualizar campo
   * @param {Object} permissions 
   * @param {string} fieldName 
   * @returns {boolean}
   */
  canViewField(permissions, fieldName) {
    if (!permissions) return false;
    if (permissions.role === PERMISSION_ROLES.SUPER_ADMIN) return true;
    
    const fieldPerm = permissions.fields?.[fieldName];
    return fieldPerm?.view === true;
  }

  /**
   * Verifica se usuário pode editar campo
   * @param {Object} permissions 
   * @param {string} fieldName 
   * @returns {boolean}
   */
  canEditField(permissions, fieldName) {
    if (!permissions) return false;
    if (permissions.role === PERMISSION_ROLES.SUPER_ADMIN) return true;
    
    const fieldPerm = permissions.fields?.[fieldName];
    return fieldPerm?.edit === true;
  }

  /**
   * Filtra contratos com base nas permissões do usuário
   * @param {Array} contracts 
   * @param {Object} permissions 
   * @returns {Array}
   */
  filterContracts(contracts, permissions) {
    if (!permissions || !Array.isArray(contracts)) return contracts;
    
    // Super admin e admin veem tudo
    if ([PERMISSION_ROLES.SUPER_ADMIN, PERMISSION_ROLES.ADMIN].includes(permissions.role)) {
      return contracts;
    }

    return contracts.filter(contract => {
      // Filtro por workflow
      if (permissions.allowedWorkflows?.length > 0) {
        const contractWorkflow = this._normalizeWorkflowId(
          contract.workflowId || contract.workflowType || 'individual'
        );
        const allowedWorkflows = permissions.allowedWorkflows.map(w => this._normalizeWorkflowId(w));
        
        if (!allowedWorkflows.includes(contractWorkflow)) {
          return false;
        }
      }

      // Filtro por vendedor/construtora
      if (permissions.allowedVendors?.length > 0) {
        const vendor = contract.vendedorConstrutora;
        if (!vendor || !permissions.allowedVendors.includes(vendor)) {
          return false;
        }
      }

      // Filtro por status
      if (permissions.allowedStatus?.length > 0) {
        const status = contract.status;
        if (!status || !permissions.allowedStatus.includes(status)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Filtra campos visíveis de um contrato
   * @param {Object} contract 
   * @param {Object} permissions 
   * @returns {Object}
   */
  filterContractFields(contract, permissions) {
    if (!contract || !permissions) return contract;
    
    // Super admin e admin veem todos os campos
    if ([PERMISSION_ROLES.SUPER_ADMIN, PERMISSION_ROLES.ADMIN].includes(permissions.role)) {
      return contract;
    }

    const filtered = {};
    
    for (const [key, value] of Object.entries(contract)) {
      // Sempre mantém id
      if (key === 'id') {
        filtered[key] = value;
        continue;
      }
      
      // Verifica se usuário pode ver o campo
      if (this.canViewField(permissions, key)) {
        filtered[key] = value;
      }
    }
    
    return filtered;
  }

  /**
   * Retorna permissões padrão para usuário não cadastrado
   * @private
   */
  _getDefaultPermissions() {
    return {
      role: PERMISSION_ROLES.VIEWER,
      ...DEFAULT_ROLE_PERMISSIONS[PERMISSION_ROLES.VIEWER]
    };
  }

  /**
   * Normaliza ID de workflow
   * @private
   */
  _normalizeWorkflowId(value) {
    return value === undefined || value === null
      ? ''
      : String(value).trim().toLowerCase();
  }

  /**
   * Compara hierarquia de roles
   * @param {string} role1 
   * @param {string} role2 
   * @returns {number} -1 se role1 < role2, 0 se igual, 1 se role1 > role2
   */
  compareRoles(role1, role2) {
    const level1 = ROLE_HIERARCHY[role1] || 0;
    const level2 = ROLE_HIERARCHY[role2] || 0;
    
    if (level1 < level2) return -1;
    if (level1 > level2) return 1;
    return 0;
  }

  /**
   * Invalida cache de permissões
   * @param {string} uid 
   */
  invalidateCache(uid) {
    if (uid) {
      cacheService.invalidate(`${this.cachePrefix}${uid}`);
      cacheService.invalidate(`${this.legacyCachePrefix}${uid}`);
    } else {
      cacheService.invalidateByPattern(new RegExp(`^${this.cachePrefix}`));
      cacheService.invalidateByPattern(new RegExp(`^${this.legacyCachePrefix}`));
    }
  }

  /**
   * Cria permissões padrão para um novo usuário
   * @param {string} uid 
   * @param {string} email 
   * @param {string} role 
   */
  async createDefaultPermissions(uid, email, role = PERMISSION_ROLES.ANALYST) {
    const permissions = {
      uid,
      email,
      role,
      ...DEFAULT_ROLE_PERMISSIONS[role],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: auth.currentUser?.email || 'system'
    };

    await this.collection.doc(uid).set(permissions);
    cacheService.invalidate(`${this.cachePrefix}${uid}`);
    cacheService.invalidate(`${this.legacyCachePrefix}${uid}`);
    
    if (window.__DEBUG__) {
      console.log(' Permissões padrão criadas:', uid, role);
    }
    
    return permissions;
  }
}

// Exporta instância singleton
const permissionsService = new PermissionsService();

// Expõe globalmente para debug
if (typeof window !== 'undefined') {
  window.permissionsService = permissionsService;
}

export default permissionsService;
