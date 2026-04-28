// Configuração correta do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAhDc_xbGWnB8RplOX1BtGjj_CBtje2agA",
  authDomain: "gestor-de-processos-a541c.firebaseapp.com",
  projectId: "gestor-de-processos-a541c",
  storageBucket: "gestor-de-processos-a541c.firebasestorage.app",
  messagingSenderId: "850717432958",
  appId: "1:850717432958:web:7f0c99874f63541d6fcc2f",
  measurementId: "G-DH56341485"
};

//  SEGURANÇA: Configuração do App Check
// ATENÇÃO: Configure a chave reCAPTCHA v3 no Firebase Console
// https://console.firebase.google.com/project/gestor-de-processos-a541c/appcheck
const APP_CHECK_CONFIG = {
  // TEMPORARIAMENTE DESABILITADO até configurar no Console
  enabled: false, // Mude para true após configurar reCAPTCHA no Console
  // Em produção, use reCAPTCHA v3 com chave do Firebase Console
  // Em desenvolvimento local, use debug token
  isDebugMode: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
  // Substitua pela sua chave reCAPTCHA v3 do Firebase Console
  siteKey: '6LcAlj0sAAAAAGj2Z4L2GY37KUZpRskTGPXEsStk' // CONFIGURE NO CONSOLE
};

// Aguardar o Firebase estar disponível com limite de tentativas
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 100; // 10 segundos máximo

function initializeFirebaseAuth() {
  initAttempts++;
  
  if (typeof firebase === 'undefined') {
    if (initAttempts < MAX_INIT_ATTEMPTS) {
      console.log(`Aguardando Firebase carregar... (tentativa ${initAttempts})`);
      setTimeout(initializeFirebaseAuth, 100);
    } else {
      console.error(' Firebase não carregou após 10 segundos');
    }
    return;
  }

  try {
    // Verificar se já foi inicializado
    if (firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
      console.log(' Firebase inicializado com sucesso');
      
      //  Inicializa App Check para proteção contra abuso
      try {
        if (APP_CHECK_CONFIG.enabled && typeof firebase.appCheck !== 'undefined') {
          const appCheck = firebase.appCheck();
          if (APP_CHECK_CONFIG.isDebugMode) {
            // Em desenvolvimento, usa debug token
            // Configure no console: https://firebase.google.com/docs/app-check/web/debug-provider
            console.warn(' App Check em modo DEBUG (apenas desenvolvimento)');
            self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
          }
          appCheck.activate(
            APP_CHECK_CONFIG.siteKey,
            true // Auto-refresh tokens
          );
          console.log(' Firebase App Check ativado');
        } else if (!APP_CHECK_CONFIG.enabled) {
          // App Check desabilitado - comportamento esperado se não configurado
        } else {
          console.warn(' Firebase App Check SDK não disponível');
        }
      } catch (appCheckError) {
        console.error(' Erro ao inicializar App Check:', appCheckError);
        console.warn(' Se ver erro 403, configure App Check no Console ou desabilite em auth.js');
      }
    } else {
      console.log(' Firebase já estava inicializado');
    }
  } catch (error) {
    console.error(' Erro ao inicializar Firebase:', error);
  }
}

// Inicializar quando o script carregar
initializeFirebaseAuth();

// Obtém o serviço de autenticação para que possamos usá-lo em outros arquivos
export const auth = firebase?.auth?.() || null;
export const db = firebase?.firestore?.() || null;
export const storage = firebase?.storage?.() || null;

// Inicializa functions com região padrão (us-central1) para compatibilidade
// Funções específicas devem usar firebase.app().functions('region')
export const functions = firebase?.functions?.() || null;

// Expor globalmente para compatibilidade
if (typeof window !== 'undefined') {
  window.auth = auth;
  window.db = db;
  window.storage = storage;
  window.functions = functions;
}
