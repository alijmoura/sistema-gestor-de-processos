/**
 * Service Worker - Cache Avançado e Otimização de Assets
 * 
 * Funcionalidades:
 * - Cache inteligente com estratégias diferentes
 * - Interceptação de requests com fallback
 * - Compressão de responses
 * - Cache de APIs e recursos estáticos
 * - Atualizações em background
 * - Sincronização offline
 */

const CACHE_VERSION = '2026-04-24.18-40-27';
const CACHE_NAMES = {
  static: `gestor-static-v${CACHE_VERSION}`,
  dynamic: `gestor-dynamic-v${CACHE_VERSION}`,
  api: `gestor-api-v${CACHE_VERSION}`,
  images: `gestor-images-v${CACHE_VERSION}`
};

// Assets críticos para cache
const CRITICAL_ASSETS = [
  '/css/style.css',
  '/css/utilities.css',
  '/css/variables.css',
  '/images/logobarra.png',
  '/favicon.ico'
];

// Configuração de cache por tipo
// OTIMIZADO: Stale-While-Revalidate para APIs (serve cache + atualiza em background)
const CACHE_STRATEGIES = {
  static: 'network-first',
  api: 'stale-while-revalidate',  // MUDADO de network-first para SWR
  images: 'cache-first',
  documents: 'stale-while-revalidate'  // MUDADO para SWR
};

// Hardening de versão para evitar HTML defasado no F5.
CACHE_STRATEGIES.documents = 'network-first';

// TTLs por tipo de recurso
// OTIMIZADO: TTL de API aumentado para 30 min (alinhado com cacheService.js)
const CACHE_TTL = {
  static: 24 * 60 * 60 * 1000, // 24 horas
  dynamic: 24 * 60 * 60 * 1000,  // 24 horas
  api: 30 * 60 * 1000,               // 30 minutos (aumentado de 5 min)
  images: 30 * 24 * 60 * 60 * 1000   // 30 dias
};

let cdnConfig = null;
let compressionSupport = false;

/**
 * Event: Install
 */
self.addEventListener('install', (event) => {
  console.log('Service Worker: Instalando...');
  
  event.waitUntil(
    (async () => {
      try {
        // Abre cache estático
        const staticCache = await caches.open(CACHE_NAMES.static);
        
        // Pré-cacheia assets críticos
        await staticCache.addAll(CRITICAL_ASSETS);
        
        console.log('Service Worker: Assets críticos em cache');
        
        // Força ativação
        await self.skipWaiting();
        
      } catch (error) {
        console.error('Service Worker: Erro na instalação:', error);
      }
    })()
  );
});

/**
 * Event: Activate
 */
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Ativando...');
  
  event.waitUntil(
    (async () => {
      try {
        // Limpa caches antigos
        await cleanupOldCaches();
        
        // Toma controle de todas as abas
        await self.clients.claim();
        
        console.log('Service Worker: Ativado e controlando todas as abas');
        
      } catch (error) {
        console.error('Service Worker: Erro na ativação:', error);
      }
    })()
  );
});

/**
 * Event: Fetch
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  
  // Ignora requests para outros domínios (exceto CDNs conhecidos)
  if (!shouldHandleRequest(url)) {
    return;
  }
  
  event.respondWith(handleRequest(request));
});

/**
 * Event: Message
 */
self.addEventListener('message', (event) => {
  const payload = event.data || {};
  const { type, data } = payload;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CONFIG_UPDATE':
      cdnConfig = data.config;
      console.log('Service Worker: Configuração de CDN atualizada');
      break;
      
    case 'CACHE_CLEAR':
      clearAllCaches().then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;
      
    case 'CACHE_STATUS':
      getCacheStatus().then(status => {
        event.ports[0].postMessage(status);
      });
      break;
      
    case 'PRELOAD_ASSETS':
      preloadAssets(data.assets).then(result => {
        event.ports[0].postMessage(result);
      });
      break;
  }
});

/**
 * Verifica se deve interceptar request
 */
function shouldHandleRequest(url) {
  // Requests do mesmo domínio
  if (url.origin === location.origin) {
    return true;
  }
  
  // CDNs conhecidos
  const knownCDNs = [
    'cdn.jsdelivr.net',
    'unpkg.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ];
  
  return knownCDNs.some(cdn => url.hostname.includes(cdn));
}

/**
 * Manipula requests com estratégias de cache
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  const resourceType = getResourceType(url);
  const isNavigationRequest = request.mode === 'navigate';
  const strategy = isNavigationRequest
    ? 'network-first'
    : (CACHE_STRATEGIES[resourceType] || 'network-first');
  
  try {
    switch (strategy) {
      case 'cache-first':
        return await cacheFirstStrategy(request, resourceType);
      case 'network-first':
        return await networkFirstStrategy(request, resourceType);
      case 'stale-while-revalidate':
        return await staleWhileRevalidateStrategy(request, resourceType);
      default:
        return await fetch(request);
    }
  } catch (error) {
    console.error('Erro no Service Worker:', error);
    return await handleRequestError(request, resourceType);
  }
}

/**
 * Estratégia Cache First
 */
async function cacheFirstStrategy(request, resourceType) {
  const cacheName = getCacheName(resourceType);
  const cache = await caches.open(cacheName);
  
  // Tenta buscar no cache primeiro
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse && !isExpired(cachedResponse, resourceType)) {
    // Notifica hit de cache
    notifyClient('CACHE_HIT', { url: request.url, type: resourceType });
    return cachedResponse;
  }
  
  // Se não encontrou no cache, busca na network
  try {
    const networkResponse = await fetch(request);
    
    // Só cacheia respostas completas (200) - ignora 206 (Partial Content)
    if (networkResponse.ok && networkResponse.status === 200) {
      // Cacheia resposta para próximas vezes
      const responseToCache = networkResponse.clone();
      await cacheResponse(cache, request, responseToCache, resourceType);
    }
    
    return networkResponse;
  } catch (error) {
    // Se falha na network, retorna cached mesmo se expirado
    if (cachedResponse) {
      console.warn('Usando cache expirado devido a erro de network');
      return cachedResponse;
    }
    throw error;
  }
}

/**
 * Estratégia Network First
 */
async function networkFirstStrategy(request, resourceType) {
  const cacheName = getCacheName(resourceType);
  const cache = await caches.open(cacheName);
  
  try {
    // Tenta buscar na network primeiro
    const networkResponse = await fetch(request);
    
    // Só cacheia respostas OK (200) - ignora 206 (Partial Content) e outros
    if (networkResponse.ok && networkResponse.status === 200) {
      // Cacheia resposta
      const responseToCache = networkResponse.clone();
      await cacheResponse(cache, request, responseToCache, resourceType);
    }
    
    return networkResponse;
  } catch (error) {
    // Se falha na network, tenta cache
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.warn('Usando cache devido a erro de network');
      return cachedResponse;
    }
    
    throw error;
  }
}

/**
 * Estratégia Stale While Revalidate
 */
async function staleWhileRevalidateStrategy(request, resourceType) {
  const cacheName = getCacheName(resourceType);
  const cache = await caches.open(cacheName);
  
  // Busca no cache
  const cachedResponse = await cache.match(request);
  
  // Busca na network em background
  const networkPromise = fetch(request).then(response => {
    // Só cacheia respostas completas (200) - ignora 206 (Partial Content)
    if (response.ok && response.status === 200) {
      const responseToCache = response.clone();
      cacheResponse(cache, request, responseToCache, resourceType);
    }
    return response;
  }).catch(error => {
    console.warn('Erro na revalidação em background:', error);
  });
  
  // Retorna cache imediatamente se disponível
  if (cachedResponse && !isExpired(cachedResponse, resourceType)) {
    // Aguarda network em background
    networkPromise;
    return cachedResponse;
  }
  
  // Se não tem cache válido, aguarda network
  return await networkPromise;
}

/**
 * Obtém tipo de recurso
 */
function getResourceType(url) {
  const pathname = url.pathname.toLowerCase();
  
  if (pathname.match(/\.(js|mjs)$/)) return 'static';
  if (pathname.match(/\.css$/)) return 'static';
  if (pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)) return 'images';
  if (pathname.includes('/api/') || url.hostname.includes('firestore')) return 'api';
  if (pathname.match(/\.(html|htm)$/)) return 'documents';
  
  return 'dynamic';
}

/**
 * Obtém nome do cache
 */
function getCacheName(resourceType) {
  return CACHE_NAMES[resourceType] || CACHE_NAMES.dynamic;
}

/**
 * Verifica se response está expirado
 */
function isExpired(response, resourceType) {
  const cachedTime = response.headers.get('sw-cached-time');
  if (!cachedTime) return false;
  
  const ttl = CACHE_TTL[resourceType] || CACHE_TTL.dynamic;
  return Date.now() - parseInt(cachedTime) > ttl;
}

/**
 * Cacheia response com metadados
 */
async function cacheResponse(cache, request, response, resourceType) {
  // Adiciona timestamp ao header
  const modifiedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      'sw-cached-time': Date.now().toString(),
      'sw-resource-type': resourceType
    }
  });
  
  await cache.put(request, modifiedResponse);
}

/**
 * Manipula erros de request
 */
async function handleRequestError(request, resourceType) {
  // Tenta fallback no cache
  const cacheName = getCacheName(resourceType);
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    console.warn('Usando cache como fallback para erro');
    return cachedResponse;
  }
  
  // Se é uma página HTML, retorna página offline
  if (resourceType === 'documents') {
    return await getOfflinePage();
  }
  
  // Para outros recursos, retorna erro
  return new Response('Network Error', {
    status: 408,
    statusText: 'Network Error'
  });
}

/**
 * Obtém página offline
 */
async function getOfflinePage() {
  const offlineHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Offline - Gestor de Contratos</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .offline-icon { font-size: 3em; margin-bottom: 20px; }
        h1 { color: #333; }
        p { color: #666; }
        .retry-btn { 
          background: #007bff; color: white; border: none; 
          padding: 10px 20px; border-radius: 5px; cursor: pointer; 
        }
      </style>
    </head>
    <body>
      <div class="offline-icon">Offline</div>
      <h1>Você está offline</h1>
      <p>Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.</p>
      <button class="retry-btn" onclick="window.location.reload()">Tentar Novamente</button>
    </body>
    </html>
  `;
  
  return new Response(offlineHtml, {
    status: 200,
    headers: { 'Content-Type': 'text/html' }
  });
}

/**
 * Limpa caches antigos
 */
async function cleanupOldCaches() {
  const cacheNames = await caches.keys();
  const currentCaches = Object.values(CACHE_NAMES);
  
  const deletePromises = cacheNames
    .filter(cacheName => !currentCaches.includes(cacheName))
    .map(cacheName => caches.delete(cacheName));
  
  await Promise.all(deletePromises);
  console.log('Caches antigos removidos');
}

/**
 * Limpa todos os caches
 */
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  console.log('Todos os caches removidos');
}

/**
 * Obtém status do cache
 */
async function getCacheStatus() {
  const cacheNames = await caches.keys();
  const status = {};
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    status[cacheName] = {
      count: keys.length,
      urls: keys.map(request => request.url)
    };
  }
  
  return status;
}

/**
 * Preload de assets
 */
async function preloadAssets(assets) {
  const results = [];
  
  for (const asset of assets) {
    try {
      const response = await fetch(asset.url);
      // Só cacheia respostas completas (200) - ignora 206 (Partial Content)
      if (response.ok && response.status === 200) {
        const cache = await caches.open(getCacheName(asset.type));
        await cache.put(asset.url, response);
        results.push({ url: asset.url, status: 'cached' });
      } else {
        results.push({ url: asset.url, status: 'error', code: response.status });
      }
    } catch (error) {
      results.push({ url: asset.url, status: 'error', message: error.message });
    }
  }
  
  return { results, total: assets.length, successful: results.filter(r => r.status === 'cached').length };
}

/**
 * Notifica cliente
 */
function notifyClient(type, data) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type, data });
    });
  });
}

/**
 * Background Sync para requests falhadas
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Implementar sincronização de dados pendentes
  console.log('Executando sincronização em background...');
}

// ==========================================
// FIREBASE CLOUD MESSAGING (FCM)
// ==========================================

/**
 * Importa scripts do Firebase para FCM
 */
/* global firebase */
// eslint-disable-next-line no-undef
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
// eslint-disable-next-line no-undef
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

/**
 * Configuração do Firebase
 * IMPORTANTE: Usar a mesma configuração do auth.js
 */
const firebaseConfig = {
  apiKey: "INSIRA_SUA_FIREBASE_API_KEY",
  authDomain: "sistema-gestor-de-processos-demo.firebaseapp.com",
  projectId: "sistema-gestor-de-processos-demo",
  storageBucket: "sistema-gestor-de-processos-demo.appspot.com",
  messagingSenderId: "1006439848000",
  appId: "1:1006439848000:web:ac01b59ce0c4d7c1c87100",
  measurementId: "G-YFY3HFYYKB"
};

/**
 * Inicializa Firebase
 */
firebase.initializeApp(firebaseConfig);

/**
 * Obtém instância do Messaging
 */
const messaging = firebase.messaging();

/**
 * Handler para mensagens recebidas em background
 * (quando a aba/app está fechada ou em background)
 */
messaging.onBackgroundMessage((payload) => {
  console.log('Mensagem recebida em background:', payload);
  
  try {
    // Extrai informações da notificação
    const notificationTitle = payload.notification?.title || 'Nova Mensagem WhatsApp';
    const notificationOptions = {
      body: payload.notification?.body || 'Você recebeu uma nova mensagem',
      icon: payload.notification?.icon || '/images/logobarra.png',
      badge: '/images/logobarra.png',
      tag: payload.data?.chatId || 'whatsapp-notification',
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: {
        url: payload.data?.url || '/index.html',
        chatId: payload.data?.chatId,
        messageId: payload.data?.messageId,
        type: payload.data?.type || 'message',
        timestamp: Date.now()
      }
    };
    
    // Adiciona ações se disponíveis
    if (payload.data?.actions) {
      notificationOptions.actions = JSON.parse(payload.data.actions);
    } else {
      // Ações padrão
      notificationOptions.actions = [
        {
          action: 'open',
          title: 'Abrir chat',
          icon: '/images/chat-icon.png'
        },
        {
          action: 'close',
          title: 'Fechar',
          icon: '/images/close-icon.png'
        }
      ];
    }
    
    // Adiciona imagem se disponível
    if (payload.notification?.image) {
      notificationOptions.image = payload.notification.image;
    }
    
    // Mostra notificação
    return self.registration.showNotification(notificationTitle, notificationOptions);
    
  } catch (error) {
    console.error('Erro ao exibir notificação:', error);
    
    // Fallback: notificação básica
    return self.registration.showNotification('Nova Mensagem', {
      body: 'Você tem novas mensagens no WhatsApp',
      icon: '/images/logobarra.png'
    });
  }
});

/**
 * Handler para clique em notificação
 */
self.addEventListener('notificationclick', (event) => {
  console.log('Notificação clicada:', event.notification.tag);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/index.html';
  const chatId = event.notification.data?.chatId;
  
  // Ação customizada
  if (event.action === 'close') {
    // Apenas fecha a notificação
    return;
  }
  
  // Abre ou foca na aba
  event.waitUntil(
    // eslint-disable-next-line no-undef
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Verifica se já existe uma aba aberta
        for (const client of clientList) {
          if (client.url.includes(urlToOpen.split('?')[0]) && 'focus' in client) {
            // Foca na aba existente e envia mensagem
            client.focus();
            
            if (chatId) {
              client.postMessage({
                type: 'NOTIFICATION_CLICKED',
                chatId: chatId,
                messageId: event.notification.data?.messageId
              });
            }
            
            return;
          }
        }
        
        // Se não encontrou aba aberta, abre nova
        const fullUrl = chatId 
          ? `${urlToOpen}?chatId=${chatId}`
          : urlToOpen;
        
        // eslint-disable-next-line no-undef
        return clients.openWindow(fullUrl);
      })
  );
});

/**
 * Handler para fechamento de notificação
 */
self.addEventListener('notificationclose', (event) => {
  console.log('Notificação fechada:', event.notification.tag);
  
  // Registra evento de fechamento (analytics)
  const data = {
    type: 'notification_dismissed',
    tag: event.notification.tag,
    chatId: event.notification.data?.chatId,
    timestamp: Date.now()
  };
  
  // Envia para analytics (se implementado)
  event.waitUntil(
    fetch('/api/analytics/notification-dismissed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).catch(err => console.warn('Analytics não disponível:', err))
  );
});

console.log('Service Worker carregado e pronto (com FCM)');
