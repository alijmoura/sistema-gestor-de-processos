import { auth, db, functions } from '../auth.js';
import { resolveTenantContext } from '../tenantService.js';

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

  try {
    await resolveTenantContext({ user });
  } catch (error) {
    console.error("[whatsapp-dashboard] Falha ao resolver empresa:", error);
    await auth.signOut().catch(() => {});
    window.location.href = "login.html?reason=tenant";
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
