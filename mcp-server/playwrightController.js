
import { chromium } from "playwright";

let browser = null;
let page = null;

export const playwrightTools = [
  {
    name: "browser_navigate",
    description: "Navega para uma URL usando um navegador (Playwright). Abre o navegador se não estiver aberto.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL para navegar"
        }
      },
      required: ["url"]
    }
  },
  {
    name: "browser_screenshot",
    description: "Tira um screenshot da página atual e retorna em base64.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "browser_click",
    description: "Clica em um elemento da página identificado por um seletor CSS.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "Seletor CSS do elemento para clicar"
        }
      },
      required: ["selector"]
    }
  },
  {
    name: "browser_fill",
    description: "Preenche um campo de formulário identificado por um seletor CSS.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "Seletor CSS do campo"
        },
        value: {
            type: "string",
            description: "Valor para preencher"
        }
      },
      required: ["selector", "value"]
    }
  },
  {
      name: "browser_get_content",
      description: "Retorna o conteúdo de texto da página atual (body).",
      inputSchema: {
          type: "object",
          properties: {}
      }
  },
  {
    name: "browser_close",
    description: "Fecha o navegador.",
    inputSchema: {
        type: "object",
        properties: {}
    }
  }
];

export async function handlePlaywrightTool(name, args) {
  if (name === "browser_navigate") {
    if (!browser) {
        // Lança com headless: false para ver acontecer se rodar local, ou true para background
        // Vamos deixar headless: true por padrão para servidor, mas pode ser configurável
        browser = await chromium.launch({ headless: true }); 
        page = await browser.newPage();
    }
    await page.goto(args.url);
    const title = await page.title();
    return {
        content: [{ type: "text", text: `Navegou para: ${args.url}\nTítulo: ${title}` }]
    };
  }

  if (name === "browser_screenshot") {
      if (!page) throw new Error("Navegador não iniciado. Use browser_navigate primeiro.");
      const buffer = await page.screenshot();
      const base64 = buffer.toString('base64');
      return {
          content: [
              { type: "text", text: "Screenshot tirado com sucesso." },
              { type: "image", data: base64, mimeType: "image/png" }
          ]
      };
  }

  if (name === "browser_click") {
      if (!page) throw new Error("Navegador não iniciado.");
      await page.click(args.selector);
      return { content: [{ type: "text", text: `Clicou em: ${args.selector}` }] };
  }

  if (name === "browser_fill") {
      if (!page) throw new Error("Navegador não iniciado.");
      await page.fill(args.selector, args.value);
      return { content: [{ type: "text", text: `Preencheu ${args.selector} com '${args.value}'` }] };
  }

  if (name === "browser_get_content") {
      if (!page) throw new Error("Navegador não iniciado.");
      const content = await page.evaluate(() => document.body.innerText);
      return { content: [{ type: "text", text: content }] };
  }

  if (name === "browser_close") {
      if (browser) {
          await browser.close();
          browser = null;
          page = null;
      }
      return { content: [{ type: "text", text: "Navegador fechado." }] };
  }

  throw new Error(`Ferramenta Playwright desconhecida: ${name}`);
}
