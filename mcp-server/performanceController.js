import { chromium } from "playwright";

let browser = null;
let page = null;

export const performanceTools = [
  {
    name: "analisar_carregamento_com_login",
    description: "Analisa o carregamento da aplicação após fazer login. Útil para testar fluxo completo com autenticação.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL da aplicação para analisar (ex: http://localhost:5173)"
        },
        email: {
          type: "string",
          description: "Email para login"
        },
        senha: {
          type: "string",
          description: "Senha para login"
        },
        timeout: {
          type: "number",
          description: "Timeout em ms para aguardar carregamento (padrão: 15000)"
        }
      },
      required: ["url", "email", "senha"]
    }
  },
  {
    name: "analisar_carregamento",
    description: "Analisa o carregamento completo da aplicação, capturando métricas de performance, screenshots e erros.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL da aplicação para analisar (ex: http://localhost:5000)"
        },
        timeout: {
          type: "number",
          description: "Timeout em ms para aguardar carregamento (padrão: 10000)"
        }
      },
      required: ["url"]
    }
  },
  {
    name: "medir_performance",
    description: "Mede métricas de performance da página (FCP, LCP, etc).",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "verificar_erros_console",
    description: "Retorna todos os erros e warnings do console da página.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "analisar_dom",
    description: "Analisa a estrutura DOM da página (componentes, IDs críticos, etc).",
    inputSchema: {
      type: "object",
      properties: {
        seletor: {
          type: "string",
          description: "Seletor CSS específico para analisar (opcional)"
        }
      }
    }
  }
];

export async function handlePerformanceTool(name, args) {
  if (name === "analisar_carregamento_com_login") {
    const { url, email, senha, timeout = 15000 } = args;

    if (!browser) {
      browser = await chromium.launch({ headless: true });
    }

    page = await browser.newPage();
    
    const startTime = Date.now();
    const consoleMessages = [];
    const networkErrors = [];
    let loginSuccess = false;

    // Captura mensagens do console
    page.on("console", msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now() - startTime
      });
    });

    // Captura erros de rede
    page.on("requestfailed", req => {
      networkErrors.push({
        url: req.url(),
        failure: req.failure()?.errorText || "Unknown error",
        timestamp: Date.now() - startTime
      });
    });

    try {
      // 1. Navega para a aplicação
      await page.goto(url, { waitUntil: "networkidle", timeout });
      
      // Aguarda o form de login aparecer
      await page.waitForSelector('input[type="email"], input[name*="email"], [data-testid="email"], #email', { timeout: 5000 }).catch(() => null);

      // 2. Tenta fazer login procurando por selectors comuns
      const emailSelectors = ['input[type="email"]', 'input[name*="email"]', '[data-testid="email"]', '#email', 'input[placeholder*="email" i]'];
      const passwordSelectors = ['input[type="password"]', 'input[name*="password"]', '[data-testid="password"]', '#password', 'input[placeholder*="senha" i]'];
      const submitSelectors = ['button[type="submit"]', 'button:has-text("Login")', 'button:has-text("Entrar")', 'button:has-text("Sign in")'];

      let emailField = null;
      for (const sel of emailSelectors) {
        emailField = await page.$(sel);
        if (emailField) break;
      }

      let passwordField = null;
      for (const sel of passwordSelectors) {
        passwordField = await page.$(sel);
        if (passwordField) break;
      }

      if (emailField && passwordField) {
        await emailField.fill(email);
        await passwordField.fill(senha);

        // Procura por botão de submit
        let submitBtn = null;
        for (const sel of submitSelectors) {
          submitBtn = await page.$(sel);
          if (submitBtn) break;
        }

        if (submitBtn) {
          await submitBtn.click();
          // Aguarda redirecionamento ou carregamento pós-login
          await page.waitForNavigation({ waitUntil: "networkidle", timeout: 10000 }).catch(() => null);
          loginSuccess = true;
        }
      }

      // 3. Aguarda o dashboard carregar completamente
      await page.waitForTimeout(2000); // Pequena pausa para animações

      // Tira screenshot do estado completo
      const screenshot = await page.screenshot({ fullPage: true });
      const screenshotBase64 = screenshot.toString('base64');

      // Coleta métricas de performance
      const metrics = await page.evaluate(() => {
        const perfData = performance.getEntriesByType("navigation")[0];
        return {
          url: window.location.href,
          title: document.title,
          currentPage: window.location.pathname,
          domContentLoaded: perfData?.domContentLoadedEventEnd - perfData?.domContentLoadedEventStart,
          loadComplete: perfData?.loadEventEnd - perfData?.loadEventStart
        };
      });

      // Conta elementos principais
      const elementCount = await page.evaluate(() => ({
        totalElements: document.querySelectorAll("*").length,
        buttons: document.querySelectorAll("button").length,
        inputs: document.querySelectorAll("input").length,
        tables: document.querySelectorAll("table").length,
        forms: document.querySelectorAll("form").length
      }));

      // Filtra erros e warnings importantes
      const errors = consoleMessages.filter(m => m.type === "error" || m.type === "warning");

      const report = {
        timestamp: new Date().toISOString(),
        url,
        loginSuccess,
        currentPage: metrics.currentPage,
        totalLoadTime: Date.now() - startTime,
        metrics,
        elementCount,
        hasConsoleErrors: errors.length > 0,
        consoleErrors: errors.slice(0, 10),
        networkErrors: networkErrors.slice(0, 5),
        status: errors.length === 0 ? "✅ Carregamento sem erros" : `⚠️ ${errors.length} erro(s) detectado(s)`
      };

      return {
        content: [
          { type: "text", text: JSON.stringify(report, null, 2) },
          { type: "image", data: screenshotBase64, mimeType: "image/png" }
        ]
      };

    } catch (error) {
      // Tenta tirar screenshot mesmo em caso de erro
      let errorScreenshot = null;
      try {
        const screenshot = await page.screenshot();
        errorScreenshot = screenshot.toString('base64');
      } catch (e) {
        // ignorado
      }

      const errorReport = {
        timestamp: new Date().toISOString(),
        url,
        loginSuccess,
        error: error.message,
        consoleMessages: consoleMessages.filter(m => m.type === "error"),
        status: "❌ Erro durante análise"
      };

      const content = [
        { type: "text", text: JSON.stringify(errorReport, null, 2) }
      ];

      if (errorScreenshot) {
        content.push({ type: "image", data: errorScreenshot, mimeType: "image/png" });
      }

      return { content, isError: true };
    }
  }

  if (name === "analisar_carregamento") {
    const { url, timeout = 10000 } = args;

    if (!browser) {
      browser = await chromium.launch({ headless: true });
    }

    page = await browser.newPage();
    
    const startTime = Date.now();
    const consoleMessages = [];
    const networkRequests = [];

    // Captura mensagens do console
    page.on("console", msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text()
      });
    });

    // Captura requisições de rede
    page.on("request", req => {
      networkRequests.push({
        url: req.url(),
        method: req.method(),
        timestamp: Date.now() - startTime
      });
    });

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout });
      const loadTime = Date.now() - startTime;

      // Tira screenshot do carregamento completo
      const screenshot = await page.screenshot({ fullPage: true });
      const screenshotBase64 = screenshot.toString('base64');

      // Coleta métricas de performance
      const metrics = await page.evaluate(() => {
        const perfData = performance.getEntriesByType("navigation")[0];
        return {
          url: window.location.href,
          title: document.title,
          domContentLoaded: perfData?.domContentLoadedEventEnd - perfData?.domContentLoadedEventStart,
          loadComplete: perfData?.loadEventEnd - perfData?.loadEventStart,
          redirectTime: perfData?.redirectEnd - perfData?.redirectStart,
          dnsTime: perfData?.domainLookupEnd - perfData?.domainLookupStart,
          connectTime: perfData?.connectEnd - perfData?.connectStart,
          requestTime: perfData?.responseStart - perfData?.requestStart,
          responseTime: perfData?.responseEnd - perfData?.responseStart
        };
      });

      // Conta elementos principais
      const elementCount = await page.evaluate(() => ({
        totalElements: document.querySelectorAll("*").length,
        buttons: document.querySelectorAll("button").length,
        inputs: document.querySelectorAll("input").length,
        images: document.querySelectorAll("img").length,
        scripts: document.querySelectorAll("script").length,
        styles: document.querySelectorAll("link[rel='stylesheet'], style").length
      }));

      const report = {
        url,
        totalLoadTime: loadTime,
        status: "Carregamento concluído com sucesso",
        metrics,
        elementCount,
        consoleMessages: consoleMessages.slice(0, 10), // Primeiras 10 mensagens
        networkRequests: networkRequests.slice(0, 5), // Primeiras 5 requisições
        hasErrors: consoleMessages.some(m => m.type === "error"),
        screenshot: screenshotBase64
      };

      return {
        content: [
          { type: "text", text: JSON.stringify(report, null, 2) },
          { type: "image", data: screenshotBase64, mimeType: "image/png" }
        ]
      };

    } catch (error) {
      return {
        content: [{ type: "text", text: `Erro ao carregar: ${error.message}` }],
        isError: true
      };
    }
  }

  if (name === "medir_performance") {
    if (!page) throw new Error("Navegador não iniciado. Use analisar_carregamento primeiro.");

    const metrics = await page.evaluate(() => {
      const perfData = performance.getEntriesByType("navigation")[0];
      const paintEntries = performance.getEntriesByType("paint");
      
      return {
        navigationTiming: {
          domContentLoaded: perfData?.domContentLoadedEventEnd - perfData?.domContentLoadedEventStart,
          loadComplete: perfData?.loadEventEnd - perfData?.loadEventStart,
          totalTime: perfData?.loadEventEnd - perfData?.fetchStart
        },
        paintTiming: paintEntries.map(p => ({
          name: p.name,
          startTime: Math.round(p.startTime)
        })),
        resourceTiming: performance.getEntriesByType("resource").slice(0, 5).map(r => ({
          name: r.name,
          duration: Math.round(r.duration),
          size: r.transferSize || "unknown"
        }))
      };
    });

    return {
      content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }]
    };
  }

  if (name === "verificar_erros_console") {
    if (!page) throw new Error("Navegador não iniciado.");

    const errors = await page.evaluate(() => {
      return {
        windowErrors: window.__errors__ || [],
        uncaughtPromises: window.__unhandledRejections__ || []
      };
    });

    return {
      content: [{ type: "text", text: JSON.stringify(errors, null, 2) }]
    };
  }

  if (name === "analisar_dom") {
    if (!page) throw new Error("Navegador não iniciado.");

    const { seletor } = args;

    const domAnalysis = await page.evaluate((sel) => {
      const target = sel ? document.querySelector(sel) : document.documentElement;
      
      if (!target) {
        return { error: `Nenhum elemento encontrado para: ${sel}` };
      }

      return {
        tagName: target.tagName,
        id: target.id,
        classes: Array.from(target.classList),
        children: target.children.length,
        attributes: Array.from(target.attributes).map(a => `${a.name}="${a.value}"`),
        textContent: target.innerText?.slice(0, 200) || "(vazio)"
      };
    }, seletor);

    return {
      content: [{ type: "text", text: JSON.stringify(domAnalysis, null, 2) }]
    };
  }

  throw new Error(`Ferramenta de performance desconhecida: ${name}`);
}
