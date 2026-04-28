import { redirectToLogin } from '../authRedirect.js';
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
    console.warn("[whatsapp-workflows] Falha ao validar politica de senha:", error);
  }
  return true;
}

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    alert("Voce precisa estar logado para acessar esta pagina.");
    redirectToLogin();
    return;
  }

  console.log("Usuario autenticado:", user.email);

  const canProceed = await enforcePasswordPolicyOrRedirect();
  if (!canProceed) {
    return;
  }

  try {
    await resolveTenantContext({ user });
  } catch (error) {
    console.error("[whatsapp-workflows] Falha ao resolver empresa:", error);
    await auth.signOut().catch(() => {});
    redirectToLogin({ reason: 'tenant' });
    return;
  }

  const idToken = await user.getIdTokenResult();
  if (!idToken.claims.admin) {
    alert("Apenas administradores podem gerenciar workflows.");
    window.location.href = "index.html";
    return;
  }

  console.log("Usuario admin confirmado");

  try {
    const cacheBuster = Date.now();
    const botModule = await import(`../whatsappBot.js?v=${cacheBuster}`);
    window.__WHATSAPP_BOT__ = botModule.default;

    const templatesModule = await import(`../whatsappWorkflowTemplates.js?v=${cacheBuster}`);
    window.__WORKFLOW_TEMPLATES__ = templatesModule;

    const uiModule = await import(`../whatsappWorkflowUI.js?v=${cacheBuster}`);
    window.__WORKFLOW_UI__ = uiModule.default;
    uiModule.default.init();

    console.log("Sistema de workflows inicializado");

    document.getElementById("new-workflow-btn")?.addEventListener("click", () => {
      uiModule.default.openNewWorkflowModal();
    });

    document.getElementById("create-templates-btn")?.addEventListener("click", async () => {
      if (!confirm("Deseja criar os 5 workflows de template padrao? (Workflows duplicados serao ignorados)")) {
        return;
      }

      const btn = document.getElementById("create-templates-btn");
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Criando...';

      try {
        const results = await templatesModule.criarWorkflowsPadrao(db, user.uid);
        const created = results.filter((r) => r.success).length;
        const skipped = results.filter((r) => !r.success).length;

        alert(`Templates criados!\n\nCriados: ${created}\nIgnorados (ja existem): ${skipped}`);
        uiModule.default.init();
      } catch (error) {
        console.error("Erro ao criar templates:", error);
        alert(`Erro ao criar templates: ${error.message}`);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-collection me-2"></i>Criar Templates';
      }
    });

    document.querySelectorAll('input[name="filter-workflows"]').forEach((radio) => {
      radio.addEventListener("change", (event) => {
        uiModule.default.filterWorkflows(event.target.value);
      });
    });
  } catch (error) {
    console.error("Erro ao inicializar sistema de workflows:", error);
    alert("Erro ao carregar sistema de workflows. Verifique o console.");
  }
});
