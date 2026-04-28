/**
 * @file googleContactsService.js
 * @description Sincroniza contatos do Google Contacts e disponibiliza nomes para módulos WhatsApp
 */

import { db, auth } from './auth.js';
import cacheService from './cacheService.js';

const CONTACTS_COLLECTION = 'whatsappGoogleContacts';
const CONTACTS_CACHE_KEY = 'google_contacts_all';
const GOOGLE_CONTACTS_CACHE_TYPE = 'googleContacts';
const GOOGLE_CONTACTS_CLIENT_ID_KEY = 'GOOGLE_CONTACTS_CLIENT_ID';
const GOOGLE_CONTACTS_API_KEY_KEY = 'GOOGLE_CONTACTS_API_KEY';
const CSV_PHONE_KEYS = ['phone', 'telefone', 'numero', 'celular', 'whatsapp', 'whatsappphone', 'phone1', 'telefone1', 'telefoneprincipal', 'mobile'];
const CSV_NAME_KEYS = ['name', 'nome', 'displayname', 'full_name', 'fullname', 'contato', 'cliente'];
const CSV_GIVEN_NAME_KEYS = ['firstname', 'givenname', 'nome', 'primeironome'];
const CSV_FAMILY_NAME_KEYS = ['lastname', 'familyname', 'sobrenome', 'ultimonome'];
const CSV_EMAIL_KEYS = ['email', 'e-mail', 'mail', 'emailprincipal'];
const CSV_ORGANIZATION_KEYS = ['company', 'empresa', 'organization', 'organizacao', 'departamento', 'setor'];

function toNullIfEmpty(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function normalizeHeaderKey(key = '') {
  return String(key).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectCsvDelimiter(line = '') {
  const counts = {
    ',': (line.match(/,/g) || []).length,
    ';': (line.match(/;/g) || []).length,
    '\t': (line.match(/\t/g) || []).length
  };

  let bestDelimiter = ',';
  let bestCount = -1;

  Object.entries(counts).forEach(([delimiterKey, count]) => {
    if (count > bestCount) {
      bestDelimiter = delimiterKey === '\t' ? '\t' : delimiterKey;
      bestCount = count;
    }
  });

  if (bestCount <= 0) {
    return ',';
  }

  return bestDelimiter;
}

function splitCsvLine(line = '', delimiter = ',') {
  const result = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result.map(value => (typeof value === 'string' ? value.trim() : value));
}

function parseCsvContent(content = '') {
  if (typeof content !== 'string' || content.trim() === '') {
    return { headers: [], rows: [] };
  }

  const sanitized = content
    .replace(/\ufeff/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const rawLines = sanitized.split('\n');
  const headerIndex = rawLines.findIndex(line => line.trim() !== '');
  if (headerIndex === -1) {
    return { headers: [], rows: [] };
  }

  const headerLine = rawLines[headerIndex];
  const delimiter = detectCsvDelimiter(headerLine);
  const headers = splitCsvLine(headerLine, delimiter).map(header => header.trim());
  const rows = [];

  for (let i = headerIndex + 1; i < rawLines.length; i += 1) {
    const rawLine = rawLines[i];
    if (!rawLine || rawLine.trim() === '') continue;

    const values = splitCsvLine(rawLine, delimiter);
    const hasContent = values.some(value => value && String(value).trim() !== '');
    if (!hasContent) continue;

    const row = {};
    headers.forEach((header, index) => {
      const value = values[index] !== undefined ? values[index] : '';
      const cleanValue = typeof value === 'string' ? value.trim() : value;
      const normalizedKey = normalizeHeaderKey(header);

      if (header) {
        row[header] = cleanValue;
      }

      if (normalizedKey && normalizedKey !== header) {
        if (row[normalizedKey] === undefined || row[normalizedKey] === null || row[normalizedKey] === '') {
          row[normalizedKey] = cleanValue;
        }
      }
    });

    rows.push(row);
  }

  return { headers, rows, delimiter };
}

function getRowValue(row, keys = []) {
  if (!row) return null;

  for (const key of keys) {
    if (!key) continue;

    const normalized = normalizeHeaderKey(key);

    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }

    if (row[normalized] !== undefined && row[normalized] !== null && String(row[normalized]).trim() !== '') {
      return String(row[normalized]).trim();
    }

    const matchedKey = Object.keys(row).find(rowKey => normalizeHeaderKey(rowKey) === normalized);
    if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null) {
      const candidate = String(row[matchedKey]).trim();
      if (candidate !== '') {
        return candidate;
      }
    }
  }

  return null;
}

function mapCsvRowToManualContact(row) {
  const phoneRaw = getRowValue(row, CSV_PHONE_KEYS);
  const normalizedPhone = normalizeLocalPhone(phoneRaw);
  if (!normalizedPhone) return null;

  const givenName = getRowValue(row, CSV_GIVEN_NAME_KEYS);
  const familyName = getRowValue(row, CSV_FAMILY_NAME_KEYS);
  let displayName = getRowValue(row, CSV_NAME_KEYS);
  if (!displayName && givenName) {
    displayName = familyName ? `${givenName} ${familyName}`.trim() : givenName;
  }

  const primaryEmail = getRowValue(row, CSV_EMAIL_KEYS);
  const organization = getRowValue(row, CSV_ORGANIZATION_KEYS);

  const entry = {
    phone: normalizedPhone,
    rawPhone: toNullIfEmpty(phoneRaw) || normalizedPhone,
    displayName: toNullIfEmpty(displayName),
    givenName: toNullIfEmpty(givenName),
    familyName: toNullIfEmpty(familyName),
    primaryEmail: toNullIfEmpty(primaryEmail),
    organization: toNullIfEmpty(organization),
    resourceName: null,
    metadata: {
      fromGoogle: false,
      syncSource: 'manualCsv'
    }
  };

  if (!entry.displayName && entry.primaryEmail) {
    entry.displayName = entry.primaryEmail;
  }

  return entry;
}

function normalizeLocalPhone(value) {
  if (!value) return null;

  const whatsappApi = window.__WHATSAPP_SERVICE__;
  if (whatsappApi?.normalizePhoneNumber) {
    const strict = whatsappApi.normalizePhoneNumber(value, { strict: true });
    if (strict) {
      console.log(`[normalizeLocalPhone]  "${value}" → "${strict}" (strict)`);
      return strict;
    }
    const normalized = whatsappApi.normalizePhoneNumber(value) || null;
    if (normalized) {
      console.log(`[normalizeLocalPhone]  "${value}" → "${normalized}" (normal)`);
    } else {
      console.log(`[normalizeLocalPhone]  "${value}" → null (whatsapp service)`);
    }
    return normalized;
  }

  const digits = String(value).replace(/\D/g, '');
  if (!digits) {
    console.log(`[normalizeLocalPhone]  "${value}" → null (sem dígitos)`);
    return null;
  }
  
  let result = null;
  if (digits.length === 11 && digits.startsWith('0')) {
    result = `55${digits.slice(1)}`;
  } else if (digits.length === 11) {
    result = `55${digits}`;
  } else if (digits.length === 13 && digits.startsWith('55')) {
    result = digits;
  }

  if (result) {
    console.log(`[normalizeLocalPhone]  "${value}" → "${result}" (fallback)`);
  } else {
    console.log(`[normalizeLocalPhone]  "${value}" → null (formato inválido: ${digits.length} dígitos)`);
  }
  
  return result;
}

function buildContactDisplayName(contact) {
  if (!contact) return null;
  return contact.displayName
    || contact.givenName
    || contact.primaryEmail
    || contact.familyName
    || null;
}

class GoogleContactsService {
  constructor() {
    this.gapi = null;
    this.isInitialized = false;
    this.isAuthenticating = false;
    this.isAuthenticated = false;

    this.CLIENT_ID = null;
    this.API_KEY = null;
    this.SCOPES = 'https://www.googleapis.com/auth/contacts.readonly';
    this.DISCOVERY_DOCS = ['https://people.googleapis.com/$discovery/rest?version=v1'];

    this.contactsCache = null;
    this.contactsCacheTimestamp = 0;
    this.configLoaded = false;
  }

  /**
   * Aplica configuração vinda do Firestore/arquivo local sem revalidar gapi
   */
  applyConfig(config = {}) {
    if (!config) return;

    const { googleContactsClientId, googleContactsApiKey } = config;

    if (googleContactsClientId) {
      this.CLIENT_ID = googleContactsClientId;
      localStorage.setItem(GOOGLE_CONTACTS_CLIENT_ID_KEY, googleContactsClientId);
    }

    if (googleContactsApiKey) {
      this.API_KEY = googleContactsApiKey;
      localStorage.setItem(GOOGLE_CONTACTS_API_KEY_KEY, googleContactsApiKey);
    }

    if (googleContactsClientId || googleContactsApiKey) {
      this.configLoaded = true;
    }
  }

  /**
   * Atualiza credenciais em memória e armazenamento local
   */
  updateCredentials(credentials = {}) {
    const { clientId, apiKey } = credentials;

    if (clientId !== undefined) {
      this.CLIENT_ID = clientId || null;
      clientId
        ? localStorage.setItem(GOOGLE_CONTACTS_CLIENT_ID_KEY, clientId)
        : localStorage.removeItem(GOOGLE_CONTACTS_CLIENT_ID_KEY);
    }

    if (apiKey !== undefined) {
      this.API_KEY = apiKey || null;
      apiKey
        ? localStorage.setItem(GOOGLE_CONTACTS_API_KEY_KEY, apiKey)
        : localStorage.removeItem(GOOGLE_CONTACTS_API_KEY_KEY);
    }

    if (clientId || apiKey) {
      this.configLoaded = true;
    }
  }

  /**
   * Carrega credenciais de localStorage ou Firestore
   */
  async loadConfiguration(forceReload = false) {
    if (this.configLoaded && !forceReload) {
      return true;
    }

    try {
      const localClientId = localStorage.getItem(GOOGLE_CONTACTS_CLIENT_ID_KEY);
      const localApiKey = localStorage.getItem(GOOGLE_CONTACTS_API_KEY_KEY);

      if (localClientId) {
        this.CLIENT_ID = localClientId;
      }
      if (localApiKey) {
        this.API_KEY = localApiKey;
      }

      if (!this.CLIENT_ID || !this.API_KEY) {
        const configDoc = await db.collection('whatsappConfig').doc('settings').get();
        if (configDoc.exists) {
          const data = configDoc.data() || {};
          if (!this.CLIENT_ID && data.googleContactsClientId) {
            this.CLIENT_ID = data.googleContactsClientId;
            localStorage.setItem(GOOGLE_CONTACTS_CLIENT_ID_KEY, data.googleContactsClientId);
          }
          if (!this.API_KEY && data.googleContactsApiKey) {
            this.API_KEY = data.googleContactsApiKey;
            localStorage.setItem(GOOGLE_CONTACTS_API_KEY_KEY, data.googleContactsApiKey);
          }
        }
      }

      this.configLoaded = Boolean(this.CLIENT_ID && this.API_KEY);
      return this.configLoaded;
    } catch (error) {
      console.error('[googleContactsService] Erro ao carregar configurações:', error);
      return false;
    }
  }

  async ensureGapiLoaded() {
    if (this.gapi) return;

    await new Promise((resolve, reject) => {
      if (window.gapi) {
        this.gapi = window.gapi;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        this.gapi = window.gapi;
        resolve();
      };
      script.onerror = () => reject(new Error('Falha ao carregar script Google API'));
      document.head.appendChild(script);
    });
  }

  async initializeGoogleClient() {
    if (this.isInitialized) return;
    if (!this.CLIENT_ID || !this.API_KEY) {
      throw new Error('Credenciais do Google Contacts não configuradas. Informe Client ID e API Key.');
    }

    await this.ensureGapiLoaded();

    await new Promise((resolve, reject) => {
      this.gapi.load('client:auth2', async () => {
        try {
          await this.gapi.client.init({
            apiKey: this.API_KEY,
            clientId: this.CLIENT_ID,
            discoveryDocs: this.DISCOVERY_DOCS,
            scope: this.SCOPES
          });

          await this.gapi.client.load('people', 'v1');

          const authInstance = this.gapi.auth2.getAuthInstance();
          this.isAuthenticated = authInstance.isSignedIn.get();

          if (this.isAuthenticated) {
            this.currentUser = authInstance.currentUser.get();
          }

          this.isInitialized = true;
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async ensureAuthenticated(interactive = true) {
    if (!this.isInitialized) {
      await this.initializeGoogleClient();
    }

    if (this.isAuthenticated) {
      return true;
    }

    if (!interactive) {
      return false;
    }

    if (this.isAuthenticating) {
      return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          if (!this.isAuthenticating) {
            clearInterval(interval);
            this.isAuthenticated ? resolve(true) : reject(new Error('Não autenticado'));
          }
        }, 300);
      });
    }

    try {
      this.isAuthenticating = true;
      const authInstance = this.gapi.auth2.getAuthInstance();
      const user = await authInstance.signIn();
      this.currentUser = user;
      this.isAuthenticated = true;
      return true;
    } catch (error) {
      console.error('[googleContactsService] Falha ao autenticar usuário:', error);
      throw error;
    } finally {
      this.isAuthenticating = false;
    }
  }

  async fetchAllConnections() {
    const contacts = [];
    let pageToken = null;

    do {
      const response = await this.gapi.client.people.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        pageToken,
        personFields: 'names,emailAddresses,phoneNumbers,organizations'
      });

      const result = response.result || {};
      if (Array.isArray(result.connections)) {
        contacts.push(...result.connections);
      }

      pageToken = result.nextPageToken;
    } while (pageToken);

    return contacts;
  }

  normalizeContacts(rawContacts = []) {
    const normalizedEntries = [];

    rawContacts.forEach(contact => {
      const names = contact.names || [];
      const primaryName = names.find(name => name.metadata?.primary) || names[0] || {};
      const displayName = toNullIfEmpty(primaryName.displayName || primaryName.unstructuredName);
      const givenName = toNullIfEmpty(primaryName.givenName);
      const familyName = toNullIfEmpty(primaryName.familyName);

      const emails = contact.emailAddresses || [];
      const primaryEmail = toNullIfEmpty(emails.find(email => email.metadata?.primary)?.value || emails[0]?.value);

      const organizations = contact.organizations || [];
      const organization = toNullIfEmpty(organizations.find(org => org.metadata?.primary)?.name || organizations[0]?.name);

      const phoneNumbers = contact.phoneNumbers || [];
      phoneNumbers.forEach(phoneEntry => {
        const rawPhone = typeof phoneEntry.value === 'string' ? phoneEntry.value.trim() : phoneEntry.value;
        const normalizedPhone = normalizeLocalPhone(rawPhone);

        if (!normalizedPhone) {
          return;
        }

        normalizedEntries.push({
          phone: normalizedPhone,
          rawPhone,
          displayName,
          givenName,
          familyName,
          primaryEmail,
          organization,
          resourceName: contact.resourceName || null,
          metadata: {
            fromGoogle: true,
            syncSource: 'googleApi',
            syncTimestamp: Date.now()
          }
        });
      });
    });

    return normalizedEntries;
  }

  async persistContacts(entries = []) {
    if (!entries.length) {
      return { saved: 0 };
    }

    const batchSize = 400;
  let savedCount = 0;
  const processedPhones = new Set();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const syncedBy = auth.currentUser?.email || auth.currentUser?.uid || null;

    for (let i = 0; i < entries.length; i += batchSize) {
      const chunk = entries.slice(i, i + batchSize);
      const batch = db.batch();

      chunk.forEach(entry => {
        const docRef = db.collection(CONTACTS_COLLECTION).doc(entry.phone);
        processedPhones.add(entry.phone);
        const metadata = entry.metadata || {};
        const payload = {
          displayName: toNullIfEmpty(entry.displayName) || toNullIfEmpty(entry.givenName) || toNullIfEmpty(entry.primaryEmail),
          givenName: toNullIfEmpty(entry.givenName),
          familyName: toNullIfEmpty(entry.familyName),
          primaryEmail: toNullIfEmpty(entry.primaryEmail),
          organization: toNullIfEmpty(entry.organization),
          syncedAt: now,
          syncedBy,
          fromGoogle: metadata.fromGoogle !== undefined ? Boolean(metadata.fromGoogle) : true,
          syncSource: metadata.syncSource || (metadata.fromGoogle === false ? 'manualCsv' : 'googleContacts'),
          active: true
        };

        const rawPhoneValue = toNullIfEmpty(entry.rawPhone) || entry.phone;
        if (rawPhoneValue) {
          payload.rawPhones = firebase.firestore.FieldValue.arrayUnion(rawPhoneValue);
        }

        if (entry.resourceName) {
          payload.resourceName = entry.resourceName;
        }

        batch.set(docRef, payload, { merge: true });
      });

      await batch.commit();
      savedCount = processedPhones.size;
    }

    cacheService.invalidate(CONTACTS_CACHE_KEY);
    cacheService.invalidateByPattern(/^google_contact_/);

    return { saved: savedCount };
  }

  async updateSyncMetadata(totalContacts = 0, context = {}) {
    try {
      const payload = {
        googleContactsLastSync: firebase.firestore.FieldValue.serverTimestamp(),
        googleContactsLastSyncCount: totalContacts,
        googleContactsLastSyncBy: auth.currentUser?.email || auth.currentUser?.uid || null
      };

      if (context.source) {
        payload.googleContactsLastSyncSource = context.source;
      }

      if (context.fileName) {
        payload.googleContactsLastSyncFile = context.fileName;
      }

      await db.collection('whatsappConfig').doc('settings').set(payload, { merge: true });

      cacheService.invalidate('whatsapp_config');
    } catch (error) {
      console.warn('[googleContactsService] Não foi possível atualizar metadados da sincronização:', error);
    }
  }

  async syncContacts(options = {}) {
    const { interactiveAuth = true, forceConfigReload = false } = options;

    const configured = await this.loadConfiguration(forceConfigReload);
    if (!configured) {
      throw new Error('Configure Client ID e API Key do Google Contacts antes de sincronizar.');
    }

    await this.initializeGoogleClient();
    const authenticated = await this.ensureAuthenticated(interactiveAuth);
    if (!authenticated) {
      throw new Error('Autenticação com Google Contacts não realizada.');
    }

    const rawContacts = await this.fetchAllConnections();
    const normalizedEntries = this.normalizeContacts(rawContacts);

    const { saved } = await this.persistContacts(normalizedEntries);
    await this.updateSyncMetadata(normalizedEntries.length, { source: 'googleApi' });

    // Atualizar cache em memória
    const contactsMap = {};
    normalizedEntries.forEach(entry => {
      const entrySource = entry.metadata?.syncSource || 'googleApi';
      if (!contactsMap[entry.phone]) {
        contactsMap[entry.phone] = {
          displayName: toNullIfEmpty(entry.displayName) || toNullIfEmpty(entry.givenName) || toNullIfEmpty(entry.primaryEmail),
          givenName: toNullIfEmpty(entry.givenName),
          familyName: toNullIfEmpty(entry.familyName),
          primaryEmail: toNullIfEmpty(entry.primaryEmail),
          organization: toNullIfEmpty(entry.organization),
          rawPhones: [entry.rawPhone],
          syncSource: entrySource,
          fromGoogle: entry.metadata?.fromGoogle !== false
        };
      } else {
        const stored = contactsMap[entry.phone];
        if (!stored.rawPhones.includes(entry.rawPhone)) {
          stored.rawPhones.push(entry.rawPhone);
        }
      }
    });

    this.contactsCache = contactsMap;
    this.contactsCacheTimestamp = Date.now();

    return {
      totalFetched: rawContacts.length,
      totalNormalized: normalizedEntries.length,
      totalSaved: saved
    };
  }

  async importContactsFromCsvFile(file, options = {}) {
    if (!file || typeof file.text !== 'function') {
      throw new Error('Arquivo CSV inválido.');
    }

    const content = await file.text();
    const fileName = options.fileName || file.name || null;
    return this.importContactsFromCsvContent(content, { ...options, fileName });
  }

  async importContactsFromCsvContent(content, options = {}) {
    const { fileName = null } = options || {};

    console.log('[googleContactsService]  Iniciando importação CSV...');
    console.log('[googleContactsService]  Tamanho do conteúdo:', content?.length, 'caracteres');

    const parsed = parseCsvContent(content);
    console.log('[googleContactsService]  CSV parseado:', {
      headers: parsed.headers,
      totalRows: parsed.rows.length,
      delimiter: parsed.delimiter,
      primeiraLinha: parsed.rows[0]
    });

    if (!parsed.rows.length) {
      throw new Error('Nenhuma linha válida encontrada no CSV.');
    }

    const manualEntries = [];
    parsed.rows.forEach((row, index) => {
      const mapped = mapCsvRowToManualContact(row);
      if (mapped) {
        manualEntries.push(mapped);
        if (index < 3) {
          console.log(`[googleContactsService]  Linha ${index + 1} mapeada:`, mapped);
        }
      } else {
        if (index < 3) {
          console.log(`[googleContactsService]  Linha ${index + 1} rejeitada:`, row);
        }
      }
    });

    console.log('[googleContactsService]  Total de contatos válidos:', manualEntries.length);

    if (!manualEntries.length) {
      throw new Error('Nenhum telefone válido foi identificado no CSV. Verifique se há uma coluna "phone", "telefone" ou "celular" com números válidos.');
    }

    const uniquePhones = new Set(manualEntries.map(entry => entry.phone));
    console.log('[googleContactsService]  Telefones únicos:', uniquePhones.size);

    const { saved } = await this.persistContacts(manualEntries);
    await this.updateSyncMetadata(uniquePhones.size, { source: 'manualCsv', fileName });

    this.contactsCache = null;
    await this.ensureContactsCache(true);

    console.log('[googleContactsService]  Importação concluída!');

    return {
      totalRows: parsed.rows.length,
      validContacts: uniquePhones.size,
      totalSaved: saved,
      source: 'manualCsv',
      fileName: fileName || null
    };
  }

  async ensureContactsCache(forceRefresh = false) {
    if (this.contactsCache && !forceRefresh) {
      return this.contactsCache;
    }

    const contacts = await cacheService.get(
      CONTACTS_CACHE_KEY,
      async () => {
        const snapshot = await db.collection(CONTACTS_COLLECTION).get();
        const map = {};
        snapshot.forEach(doc => {
          map[doc.id] = doc.data();
        });
        return map;
      },
      GOOGLE_CONTACTS_CACHE_TYPE,
      forceRefresh
    );

    this.contactsCache = contacts || {};
    this.contactsCacheTimestamp = Date.now();
    return this.contactsCache;
  }

  async resolveContact(phoneNumber, options = {}) {
    const normalizedPhone = normalizeLocalPhone(phoneNumber);
    if (!normalizedPhone) return null;

    const cache = await this.ensureContactsCache(options.forceRefresh);
    return cache?.[normalizedPhone] || null;
  }

  async resolveDisplayName(phoneNumber, options = {}) {
    const contact = await this.resolveContact(phoneNumber, options);
    return buildContactDisplayName(contact);
  }

  async attachContactToChat(chat, options = {}) {
    if (!chat || chat.customerName) return chat;

    const phone = chat.numero || chat.phoneNumber || chat.phone || chat.from;
    const contact = await this.resolveContact(phone, options);
    if (contact) {
      chat.customerName = buildContactDisplayName(contact);
      chat.googleContact = contact;
    }
    return chat;
  }

  async attachContactsToChats(chats = [], options = {}) {
    if (!Array.isArray(chats) || chats.length === 0) return chats;

    await this.ensureContactsCache(options.forceRefresh);

    const promises = chats.map(chat => this.attachContactToChat(chat, options));
    await Promise.all(promises);
    return chats;
  }
}

const googleContactsService = new GoogleContactsService();

if (typeof window !== 'undefined') {
  window.__GOOGLE_CONTACTS_SERVICE__ = googleContactsService;
}

export default googleContactsService;
