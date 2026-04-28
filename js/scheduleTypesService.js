// @file scheduleTypesService.js
// @description Serviço para gerenciar tipos de agendamento (assinaturas, formulários, dúvidas e customizados)
// Observação: Armazena tipos em Firestore (collection 'scheduleTypes') filtrando por usuário atual; usa cacheService se disponível.

const DEFAULT_SCHEDULE_TYPES = [
  { id: 'assinatura', name: 'Assinatura de Contrato', category: 'assinatura', description: 'Reuniões para assinatura ou conferência de contrato.' },
  { id: 'formulario', name: 'Formulários/Docs', category: 'formulario', description: 'Envio, coleta ou conferência de formulários e documentações.' },
  { id: 'duvida', name: 'Dúvidas/Retorno', category: 'duvida', description: 'Tirar dúvidas, alinhamentos rápidos ou follow-ups.' },
  { id: 'outro', name: 'Outro', category: 'outro', description: 'Agendamentos diversos.' }
];

class ScheduleTypesService {
  constructor() {
    this.db = null;
    this.user = null;
    this.cacheKey = 'scheduleTypes_all';
    this.collection = 'scheduleTypes';
    this.ready = this.initializeAsync();
  }

  async initializeAsync() {
    await this.waitForFirebase();
    return true;
  }

  async waitForFirebase() {
    return new Promise((resolve) => {
      const check = () => {
        if (window.firebase?.firestore && window.firebase?.auth) {
          this.db = window.firebase.firestore();
          this.user = window.firebase.auth().currentUser;
          window.firebase.auth().onAuthStateChanged((u) => { this.user = u; });
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  async getTypes({ useCache = true } = {}) {
    await this.ready;
    if (!this.user || !this.db) return [...DEFAULT_SCHEDULE_TYPES];

    try {
      if (useCache && window.cacheService) {
        const cached = window.cacheService.getSync(this.cacheKey, 'scheduleTypes');
        if (cached) return cached;
      }

      const snapshot = await this.db
        .collection(this.collection)
        .where('createdBy', '==', this.user.uid)
        .orderBy('name', 'asc')
        .get();

      const custom = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const merged = [...DEFAULT_SCHEDULE_TYPES, ...custom];

      if (window.cacheService) {
        window.cacheService.set(this.cacheKey, merged, 'scheduleTypes');
      }

      return merged;
    } catch (error) {
      console.warn(' Falha ao carregar tipos de agendamento, usando defaults.', error);
      return [...DEFAULT_SCHEDULE_TYPES];
    }
  }

  async addType({ name, category = 'outro', description = '' }) {
    await this.ready;
    if (!this.user || !this.db) throw new Error('Usuário não autenticado');

    const payload = {
      name: name?.trim(),
      category: category || 'outro',
      description: description?.trim() || '',
      createdBy: this.user.uid,
      createdAt: window.firebase.firestore.Timestamp.now(),
    };

    if (!payload.name) throw new Error('Nome do tipo é obrigatório');

    const docRef = await this.db.collection(this.collection).add(payload);
    await docRef.update({ id: docRef.id });
    this.invalidateCache();
    return { id: docRef.id, ...payload };
  }

  async deleteType(id) {
    await this.ready;
    if (!this.user || !this.db) throw new Error('Usuário não autenticado');
    if (!id || DEFAULT_SCHEDULE_TYPES.some((t) => t.id === id)) {
      throw new Error('Não é possível remover tipos padrão');
    }
    await this.db.collection(this.collection).doc(id).delete();
    this.invalidateCache();
    return true;
  }

  invalidateCache() {
    if (window.cacheService) {
      window.cacheService.invalidate(this.cacheKey);
    }
  }
}

// Bootstrap global
window.ScheduleTypesService = ScheduleTypesService;
window.scheduleTypesService = window.scheduleTypesService || new ScheduleTypesService();
window.DEFAULT_SCHEDULE_TYPES = DEFAULT_SCHEDULE_TYPES;
