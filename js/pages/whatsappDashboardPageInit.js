// Configuracao do Firebase (mesma do sistema principal)
const firebaseConfig = {
  apiKey: "INSIRA_SUA_FIREBASE_API_KEY",
  authDomain: "sistema-gestor-de-processos-demo.firebaseapp.com",
  projectId: "sistema-gestor-de-processos-demo",
  storageBucket: "sistema-gestor-de-processos-demo.firebasestorage.app",
  messagingSenderId: "1006439848000",
  appId: "1:1006439848000:web:ac01b59ce0c4d7c1c87100",
  measurementId: "G-YFY3HFYYKB",
};

if (firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
  if (window.__DEBUG__) {
    console.log("[whatsapp-dashboard] Firebase inicializado");
  }
}

const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.functions();

window.auth = auth;
window.db = db;

async function enforcePasswordPolicyOrRedirect() {
  try {
    const callable = functions.httpsCallable("getPasswordPolicyState");
    const result = await callable();
    if (result?.data?.mustChangePassword === true) {
      alert("Sua senha expirou. Voce precisa redefinir a senha antes de continuar.");
      window.location.href = "profile.html?forcePasswordRotation=1";
      return false;
    }
  } catch (error) {
    console.warn("[whatsapp-dashboard] Falha ao validar politica de senha:", error);
  }
  return true;
}

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    alert("Voce precisa estar logado para ver o dashboard.");
    window.close();
    return;
  }

  if (window.__DEBUG__) {
    console.log("[whatsapp-dashboard] Usuario autenticado:", user.email);
  }

  const canProceed = await enforcePasswordPolicyOrRedirect();
  if (!canProceed) {
    return;
  }

  const cacheBuster = Date.now();
  import(`../whatsappDashboard.js?v=${cacheBuster}`)
    .then((module) => {
      const whatsappDashboard = module.default;
      window.__WHATSAPP_DASHBOARD__ = whatsappDashboard;
      whatsappDashboard.init();
    })
    .catch((err) => {
      console.error("[whatsapp-dashboard] Erro ao carregar dashboard:", err);
    });
});
