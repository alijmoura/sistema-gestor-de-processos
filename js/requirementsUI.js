const sanitize = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return value;
};

let currentContract = null;
let notify = (message, type = "info") => {
  if (window.UI && typeof window.UI.showNotification === "function") {
    window.UI.showNotification(message, type);
    return;
  }
  if (typeof window.showNotification === "function") {
    window.showNotification(message, type);
    return;
  }
  console.log(`${type}: ${message}`);
};

let lastDocuments = [];
let jsPDFPromise = null;
let logoDataUrl = null;
const CUSTOM_ITBI_LOGO_PATHS = [
  () => window.__ITBI_LOGO_URL__,
  () => window.__ITBI_LOGO_DATA_URL__,
  () => "/images/almirante-tamandare.png",
  () => "/images/itbi-logo.png",
  () => "/images/logobarra.png",
  () => "/images/logologin.png",
  () => "/images/logologin-.png",
];

function getJsPDFCtor(mod) {
  return mod?.jsPDF || mod?.default?.jsPDF || window.jspdf?.jsPDF || window.jsPDF;
}

function toSafeFileName(name = "") {
  return name.replace(/[^a-z0-9\- ]/gi, " ").replace(/\s+/g, " ").trim() || "requerimento";
}

async function loadJsPDF() {
  if (!jsPDFPromise) {
    jsPDFPromise = import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js").catch((err) => {
      console.error("Falha ao carregar jsPDF do CDN", err);
      return null;
    });
  }
  return jsPDFPromise;
}

function escapeHtml(content = "") {
  return String(content)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FIELD_LABELS = {
  nome: "Nome",
  cpf: "CPF",
  estadoCivil: "Estado civil",
  rg: "RG",
  orgaoExpedidor: "Órgão expedidor",
  filiacaoPai: "Filiação (Pai)",
  filiacaoMae: "Filiação (Mãe)",
  endereco: "Endereço residencial",
  cidade: "Cidade",
  uf: "UF",
  cep: "CEP",
  nascimento: "Data de nascimento",
  email: "E-mail",
  telefone: "Telefone",
  enderecoImovel: "Endereço do imóvel",
  cidadeImovel: "Cidade do imóvel",
  ufImovel: "UF do imóvel",
  cepImovel: "CEP do imóvel",
  matriculaImovel: "Matrícula do RI",
  inscricaoImobiliaria: "Inscrição/Indicação fiscal",
  valorContratoBanco:  "Valor declarado da transação",
  tipoImovel: "Tipo do imóvel",
  areaConstruida: "Área construída",
};

const TEMPLATE_CONFIG = {
  uniao_negativa: {
    label: "Declaração Negativa de União Estável",
    requiredParticipant: [
      "nome",
      "cpf",
      "estadoCivil",
      "rg",
      "orgaoExpedidor",
      "filiacaoPai",
      "filiacaoMae",
      "endereco",
      "cidade",
      "uf",
    ],
    builder: (p, c) => {
      return [
        "DECLARAÇÃO NEGATIVA DE UNIÃO ESTÁVEL",
        `${p.nome}, CPF ${p.cpf}, ${p.estadoCivil || "estado civil não informado"}, RG ${p.rg}${p.orgaoExpedidor ? `/${p.orgaoExpedidor}` : ""}, residente em ${p.endereco}${p.cidade ? `, ${p.cidade}` : ""}${p.uf ? `/${p.uf}` : ""}, filho(a) de ${p.filiacaoPai || "(pai não informado)"} e ${p.filiacaoMae || "(mãe não informada)"}.`,
        "Declaro, para fins de financiamento habitacional e demais efeitos legais, que NÃO mantenho união estável e que minhas informações civis correspondem à realidade.",
        formatRodape(c)
      ].join("\n\n");
    },
  },
  uniao_positiva: {
    label: "Declaração Positiva de União Estável",
    requiredParticipant: [
      "nome",
      "cpf",
      "estadoCivil",
      "rg",
      "orgaoExpedidor",
      "filiacaoPai",
      "filiacaoMae",
      "endereco",
      "cidade",
      "uf",
    ],
    builder: (p, c, options) => {
      const parceiro = sanitize(options?.companheiro);
      return [
        "DECLARAÇÃO POSITIVA DE UNIÃO ESTÁVEL",
        `${p.nome}, CPF ${p.cpf}, ${p.estadoCivil || "estado civil não informado"}, RG ${p.rg}${p.orgaoExpedidor ? `/${p.orgaoExpedidor}` : ""}, residente em ${p.endereco}${p.cidade ? `, ${p.cidade}` : ""}${p.uf ? `/${p.uf}` : ""}, filho(a) de ${p.filiacaoPai || "(pai não informado)"} e ${p.filiacaoMae || "(mãe não informada)"}.`,
        parceiro
          ? `Declaro, para fins de financiamento habitacional e demais efeitos legais, que mantenho união estável com ${parceiro}, assumindo responsabilidade pelas informações prestadas.`
          : "Declaro, para fins de financiamento habitacional e demais efeitos legais, que mantenho união estável, assumindo responsabilidade pelas informações prestadas.",
        formatRodape(c)
      ].join("\n\n");
    },
  },
  itbi: {
    label: "Requerimento de ITBI (Almirante Tamandaré/PR)",
    requiredParticipant: ["nome", "cpf"],
    requiredContract: [
      "enderecoImovel",
      "cidadeImovel",
      "ufImovel",
      "matriculaImovel",
      "inscricaoImobiliaria",
    ],
    builder: (p, c, options) => {
      const valor = formatMoney(
        options?.valorContratoBanco ||
          c.valorContratoBanco ||
          c.valorContratoFinanciamento ||
          c.valorFinanciamento ||
          c.valorDeclaradoTransacao
      );
      const tipo = options?.tipoImovel || c.tipoImovel || "urbano";
      const municipio = (options?.municipio || c.cidadeImovel || "").trim();
      const uf = (options?.uf || c.ufImovel || "").trim();
      const enderecoImovel = [c.enderecoImovel, c.bairroImovel].filter(Boolean).join(" - Bairro ");
      const cidadeUf = [municipio, uf].filter(Boolean).join("/");
      const header = "FORMULÁRIO PARA EMISSÃO DE ITBI";

      const adquirente = [
        `Nome: ${p.nome}`,
        `CPF/CNPJ: ${p.cpf}`,
        `Endereço: ${p.endereco || ""}`,
        `Cidade/UF/CEP: ${[p.cidade, p.uf, p.cep].filter(Boolean).join(" / ")}`,
        `Telefone/E-mail: ${[p.telefone, p.email].filter(Boolean).join(" / ")}`,
      ];

      const imovel = [
        `Código do Imóvel: ${c.indicacaoFiscal || c.inscricaoImobiliaria || ""}`,
        `Matrícula do RI: ${c.matriculaImovel || ""}`,
        `Endereço do Imóvel: ${enderecoImovel || ""}`,
        `Cidade/UF/CEP: ${[cidadeUf, c.cepImovel].filter(Boolean).join(" / ")}`,
        `Tipo do Imóvel: ${tipo === "rural" ? "Rural" : "Urbano"}`,
        `Área do Terreno (m²): ${c.areaTerreno || ""} • Área Construída (m²): ${c.areaConstruida || ""}`,
      ];

      const transacao = [
        `Motivo da Transferência: ${c.motivoTransferencia || ""}`,
        `Tipo de Venda: Total | Parcial`,
        `Percentual Transferido (%): ${c.percentualTransferido || ""}`,
        `Valor Declarado da Transação (R$): ${valor || ""}`,
        `Valor Financiado (R$): ${c.valorFinanciado || ""}`,
        `Valor venal/mercado para ITBI (R$): ${c.valorMercadoItbi || ""}`,
      ];

      const anexos = [
        "Documentos Anexos:",
        "- (  ) Matrícula atualizada (até 30 dias)",
        "- (  ) Escritura / Contrato de Compra e Venda",
        "- (  ) CND do Imóvel",
        "- (  ) Outros (carta de arrematação, formal de partilha, etc.)",
      ];

      const declaracao = [
        "Declaração:",
        "Declaro que as informações acima são verdadeiras sob as penalidades legais e estou ciente de que o município pode solicitar documentos complementares ou abrir procedimento de avaliação caso o valor declarado não represente o valor real de mercado.",
        "Local e Data: ______________________________________",
        "Assinatura do Contribuinte: _________________________",
      ];

      return [
        header,
        "",
        "DADOS DOS ADQUIRENTES (COMPRADORES)",
        adquirente.join("\n"),
        "",
        "DADOS DO IMÓVEL",
        imovel.join("\n"),
        "",
        "DADOS DA TRANSAÇÃO",
        transacao.join("\n"),
        "",
        anexos.join("\n"),
        "",
        declaracao.join("\n"),
        "",
        formatRodape(c, municipio)
      ].join("\n");
    },
  },
  funrejus_pr: {
    label: "Isenção FUNREJUS (PR)",
    requiredParticipant: ["nome", "cpf"],
    requiredContract: ["cidadeImovel", "ufImovel", "areaConstruida"],
    builder: (p, c, options) => {
      const municipio = options?.municipio || c.cidadeImovel || "";
      const uf = options?.uf || c.ufImovel || "PR";
      return [
        "REQUERIMENTO DE ISENÇÃO DE FUNREJUS",
        `${p.nome}, CPF ${p.cpf}, solicita a isenção do FUNREJUS conforme legislação do Estado do Paraná, relativa ao imóvel situado em ${c.enderecoImovel || "(endereço não informado)"}${municipio ? `, ${municipio}` : ""}${uf ? `/${uf}` : ""}.`,
        `Metragem construída declarada: ${c.areaConstruida || "(não informada)"} m²${c.areaTerreno ? ` • Terreno: ${c.areaTerreno} m²` : ""}.`,
        `Matrícula RI: ${c.matriculaImovel || "(não informada)"}.`,
        formatRodape(c, municipio)
      ].filter(Boolean).join("\n\n");
    },
  },
  pacto: {
    label: "Requerimento Registro do Pacto",
    requiredParticipant: ["nome", "cpf", "estadoCivil"],
    builder: (p, c, options) => {
      const regime = sanitize(options?.regimeBens) || "regime não informado";
      const cartorio = sanitize(options?.cartorio) || c.cartorio || "cartório competente";
      return [
        "REQUERIMENTO PARA REGISTRO DE PACTO",
        `${p.nome}, CPF ${p.cpf}, ${p.estadoCivil || "estado civil não informado"}, solicita o registro do pacto antenupcial junto ao ${cartorio}.`,
        regime ? `Regime de bens indicado: ${regime}.` : "",
        c.matriculaImovel ? `Referência do imóvel: Matrícula ${c.matriculaImovel}.` : "",
        formatRodape(c)
      ].filter(Boolean).join("\n\n");
    },
  },
};

function formatMoney(value) {
  const numeric = typeof value === "string" ? Number.parseFloat(value.replace(/,/g, ".")) : Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return numeric.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatRodape(contract = {}, municipio = "") {
  const cidade = municipio || contract.cidadeImovel || contract.cidade || "";
  const uf = contract.ufImovel || contract.uf || "";
  const hoje = new Date();
  const data = hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  return `${cidade}${uf ? `/${uf}` : ""}, ${data}.\n\n__________________________________________\nAssinatura`;
}

function getValue(id, fallback = "") {
  const el = document.getElementById(id);
  if (el) return sanitize(el.value);
  return sanitize(fallback);
}

function collectContractContext(contract) {
  const ctx = {
    id: contract?.id || "",
    empreendimento: getValue("modal-empreendimento", contract?.empreendimento),
    bloco: getValue("modal-bloco", contract?.bloco),
    apto: getValue("modal-apto", contract?.apto),
    enderecoImovel: getValue("modal-enderecoImovel", contract?.enderecoImovel),
    cidadeImovel: getValue("modal-cidadeImovel", contract?.cidadeImovel),
    ufImovel: getValue("modal-ufImovel", contract?.ufImovel),
    cepImovel: getValue("modal-cepImovel", contract?.cepImovel),
    inscricaoImobiliaria: getValue("modal-inscricaoImobiliaria", contract?.inscricaoImobiliaria || contract?.indicacaoFiscal),
    matriculaImovel: getValue("modal-matriculaImovel", contract?.matriculaImovel || contract?.matricula),
    areaTerreno: getValue("modal-areaTerreno", contract?.areaTerreno),
    areaConstruida: getValue("modal-areaConstruida", contract?.areaConstruida),
    valorContratoBanco: getValue(
      "modal-valorContratoBanco",
      contract?.valorContratoBanco ||
        contract?.valorContratoFinanciamento ||
        contract?.valorFinanciamento ||
        contract?.valorDeclaradoTransacao
    ),
    tipoImovel: getValue("modal-tipoImovel", contract?.tipoImovel),
    empreendimentoObservacao: contract?.pesquisas || "",
    cartorio: getValue("modal-cartorio", contract?.cartorio),
  };
  return ctx;
}

function collectParticipantsFromForm(contract) {
  const container = document.getElementById("compradores-container");
  const participants = [];

  if (container) {
    const items = container.querySelectorAll(".comprador-item");
    items.forEach((item) => {
      const participant = {};
      item.querySelectorAll("[data-field]").forEach((field) => {
        const key = field.dataset.field;
        if (field.type === "radio") {
          participant[key] = field.checked;
          return;
        }
        participant[key] = sanitize(field.value);
      });
      participants.push(participant);
    });
  }

  if (participants.length) {
    return participants;
  }

  // Fallback: usa dados do contrato caso o DOM não esteja disponível
  if (Array.isArray(contract?.compradores) && contract.compradores.length) {
    return contract.compradores.map((c) => ({ ...c }));
  }

  if (contract?.clientePrincipal || contract?.cliente) {
    return [
      {
        nome: contract.clientePrincipal || contract.cliente || "",
        cpf: contract.cpf || "",
        email: contract.emailCliente || contract.email || "",
        telefone: contract.telefone || contract.celular || "",
        principal: true,
      },
    ];
  }

  return [];
}

function renderTemplateOptions(templateId, context = {}) {
  const container = document.getElementById("requirements-template-options");
  if (!container) return;

  let html = "";
  switch (templateId) {
    case "uniao_positiva":
      html = `
        <label class="form-label">Nome do(a) companheiro(a)</label>
        <input type="text" id="requirements-option-companheiro" class="form-control" placeholder="Nome completo" />
      `;
      break;
    case "itbi":
      html = `
        <div class="form-group mb-2">
          <label class="form-label">Município/UF</label>
          <div class="d-flex gap-2">
            <input type="text" id="requirements-option-municipio" class="form-control" placeholder="Cidade" value="${sanitize(context.cidadeImovel)}" />
            <input type="text" id="requirements-option-uf" class="form-control" maxlength="2" placeholder="UF" value="${sanitize(context.ufImovel)}" />
          </div>
        </div>
        <div class="form-group mb-2">
          <label class="form-label">Valor do contrato banco (R$)</label>
          <input type="number" step="0.01" id="requirements-option-valor-contrato-banco" class="form-control" value="${sanitize(context.valorContratoBanco)}" />
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Tipo do imóvel</label>
          <select id="requirements-option-tipo-imovel" class="form-select">
            <option value="">-- Selecione --</option>
            <option value="urbano" ${context.tipoImovel === "urbano" ? "selected" : ""}>Urbano</option>
            <option value="rural" ${context.tipoImovel === "rural" ? "selected" : ""}>Rural</option>
          </select>
        </div>
      `;
      break;
    case "funrejus_pr":
      html = `
        <div class="form-group mb-2">
          <label class="form-label">Município/UF</label>
          <div class="d-flex gap-2">
            <input type="text" id="requirements-option-municipio" class="form-control" placeholder="Cidade" value="${sanitize(context.cidadeImovel)}" />
            <input type="text" id="requirements-option-uf" class="form-control" maxlength="2" placeholder="UF" value="${sanitize(context.ufImovel || "PR")}" />
          </div>
        </div>
        <div class="form-text">Use para imóveis no PR com metragem reduzida (isenção FUNREJUS).</div>
      `;
      break;
    case "pacto":
      html = `
        <div class="form-group mb-2">
          <label class="form-label">Regime de bens</label>
          <input type="text" id="requirements-option-regime" class="form-control" placeholder="Comunhão parcial, separação total, etc." />
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Cartório</label>
          <input type="text" id="requirements-option-cartorio" class="form-control" placeholder="Cartório competente" value="${sanitize(context.cartorio)}" />
        </div>
      `;
      break;
    default:
      html = `<div class="text-muted small">Nenhuma configuração adicional necessária para este modelo.</div>`;
  }

  container.innerHTML = html;
}

function getTemplateOptions(templateId) {
  const options = {};
  switch (templateId) {
    case "uniao_positiva":
      options.companheiro = getValue("requirements-option-companheiro", "");
      break;
    case "itbi":
      options.municipio = getValue("requirements-option-municipio", "");
      options.uf = getValue("requirements-option-uf", "");
      options.valorContratoBanco = getValue("requirements-option-valor-contrato-banco", "");
      options.tipoImovel = getValue("requirements-option-tipo-imovel", "");
      break;
    case "funrejus_pr":
      options.municipio = getValue("requirements-option-municipio", "");
      options.uf = getValue("requirements-option-uf", "");
      break;
    case "pacto":
      options.regimeBens = getValue("requirements-option-regime", "");
      options.cartorio = getValue("requirements-option-cartorio", "");
      break;
    default:
      break;
  }
  return options;
}

function validate(templateId, participants, context, options) {
  const config = TEMPLATE_CONFIG[templateId];
  if (!config) return ["Modelo não encontrado."];
  const missing = [];

  participants.forEach((p) => {
    const nome = p.nome || "Participante";
    (config.requiredParticipant || []).forEach((field) => {
      const value = sanitize(p[field]);
      if (!value) {
        missing.push(`${nome}: ${FIELD_LABELS[field] || field}`);
      }
    });
  });

  (config.requiredContract || []).forEach((field) => {
    const value = sanitize(context[field]);
    if (!value) {
      missing.push(`Contrato: ${FIELD_LABELS[field] || field}`);
    }
  });

  if (templateId === "uniao_positiva" && !sanitize(options?.companheiro)) {
    missing.push("Complemento: Nome do(a) companheiro(a)");
  }

  return missing;
}

function buildDocuments(templateId, participants, context, options) {
  const config = TEMPLATE_CONFIG[templateId];
  if (!config) return [];
  return participants.map((p) => {
    const content = config.builder(p, context, options);
    const fileNameBase = toSafeFileName(`${config.label} - ${p.nome || "participante"}`);
    return {
      participant: p,
      content,
      fileNameBase,
      fileName: `${fileNameBase}.txt`,
      templateLabel: config.label,
      templateId,
      context,
      options,
    };
  });
}

function renderOutput(documents) {
  const container = document.getElementById("requirements-output");
  const badge = document.getElementById("requirements-participants-badge");
  if (!container) return;
  container.innerHTML = "";

  documents.forEach((doc, index) => {
    const card = document.createElement("div");
    card.className = "card shadow-sm border-0";
    card.innerHTML = `
      <div class="card-header bg-light d-flex justify-content-between align-items-center">
        <div class="d-flex flex-column">
          <span class="fw-semibold">${doc.templateLabel}</span>
          <small class="text-muted">${doc.participant.nome || "Participante"}</small>
        </div>
        <div class="btn-group btn-group-sm" role="group">
          <button type="button" class="btn btn-outline-primary" data-action="copy" data-doc-index="${index}" title="Copiar"><i class="bi bi-clipboard"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-action="download-txt" data-doc-index="${index}" title="Baixar TXT"><i class="bi bi-filetype-txt"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-action="download-doc" data-doc-index="${index}" title="Baixar Word"><i class="bi bi-file-earmark-word"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-action="download-pdf" data-doc-index="${index}" title="Baixar PDF"><i class="bi bi-filetype-pdf"></i></button>
        </div>
      </div>
      <div class="card-body">
        <pre class="bg-light border rounded p-3 small" style="white-space: pre-wrap;">${doc.content}</pre>
      </div>
    `;
    container.appendChild(card);
  });

  if (badge) {
    badge.textContent = `${documents.length} saída${documents.length === 1 ? "" : "s"}`;
  }
}

function handleCopy(documents, index) {
  const doc = documents[index];
  if (!doc) return;
  navigator.clipboard
    .writeText(doc.content)
    .then(() => notify("Conteúdo copiado para a área de transferência", "success"))
    .catch(() => notify("Não foi possível copiar o conteúdo", "warning"));
}

async function handleDownload(documents, index, format = "txt") {
  const doc = documents[index];
  if (!doc) return;

  if (format === "txt") {
    const blob = new Blob([doc.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.fileNameBase}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (format === "doc") {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><pre>${escapeHtml(doc.content)}</pre></body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.fileNameBase}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (format === "pdf") {
    try {
      const jsPdfModule = await loadJsPDF();
      const JsPDFCtor = getJsPDFCtor(jsPdfModule);
      if (!JsPDFCtor) throw new Error("jsPDF não disponível");
      if (doc.templateId === "itbi") {
        await generateItbiPdf(doc, JsPDFCtor);
      } else {
        const pdf = new JsPDFCtor();
        const lines = pdf.splitTextToSize(doc.content, 180);
        pdf.text(lines, 10, 10);
        pdf.save(`${doc.fileNameBase}.pdf`);
      }
    } catch (err) {
      console.error("Erro ao gerar PDF", err);
      notify("Não foi possível gerar o PDF. Tente novamente.", "warning");
    }
  }
}

async function loadLogoDataUrl() {
  if (logoDataUrl) return logoDataUrl;
  for (const resolver of CUSTOM_ITBI_LOGO_PATHS) {
    const path = typeof resolver === "function" ? resolver() : resolver;
    if (!path) continue;
    try {
      const res = await fetch(path);
      if (!res.ok) continue;
      const blob = await res.blob();
      const reader = new FileReader();
      const dataUrlPromise = new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      logoDataUrl = await dataUrlPromise;
      return logoDataUrl;
    } catch (err) {
      console.warn("Não foi possível carregar logo para o PDF", path, err);
    }
  }
  return null;
}

async function generateItbiPdf(doc, JsPDFCtor) {
  const pdf = new JsPDFCtor();
  const p = doc.participant || {};
  const c = doc.context || {};
  const opts = doc.options || {};

  const val = (v) => (v === undefined || v === null ? "" : String(v));
  const bold = () => pdf.setFont(undefined, "bold");
  const normal = () => pdf.setFont(undefined, "normal");
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = 20;

  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(12);

  // Header with centered logo
  try {
    const logo = await loadLogoDataUrl();
    if (logo) {
      const imgWidth = 32;
      const imgHeight = 32 * 1.2;
      const imgX = (pageWidth - imgWidth) / 2;
      pdf.addImage(logo, "PNG", imgX, y - 8, imgWidth, imgHeight, undefined, "FAST");
      y += imgHeight + 12; // extra spacing to avoid overlap with title
    }
  } catch (err) {
    console.warn("Logo não adicionada ao PDF", err);
  }

  // Separator line
  pdf.setDrawColor(120, 120, 120);
  pdf.line(18, y, pageWidth - 18, y);
  y += 10;

  // Title
  pdf.setFontSize(13);
  bold();
  pdf.text("FORMULÁRIO PARA EMISSÃO DE ITBI", pageWidth / 2, y, { align: "center" });
  y += 10;
  normal();
  pdf.setFontSize(11);

  const section = (title, subtitle = "") => {
    bold();
    pdf.text(title, 18, y);
    if (subtitle) {
      normal();
      pdf.setFontSize(10);
      pdf.text(subtitle, 18 + pdf.getTextWidth(title) + 2, y);
      pdf.setFontSize(11);
    }
    y += 7;
    normal();
  };

  const lineField = (label, value = "", optsLine = {}) => {
    const { x = 18, lineWidth = 70, gap = 2 } = optsLine;
    pdf.text(label, x, y);
    const start = x + pdf.getTextWidth(label) + gap;
    pdf.line(start, y + 1.5, start + lineWidth, y + 1.5);
    if (value) pdf.text(val(value), start + 1, y);
    y += 7;
  };

  const inline = (items, optsInline = {}) => {
    const { x = 18, gap = 4 } = optsInline;
    let cx = x;
    items.forEach(({ label, value, width = 50 }) => {
      const text = `${label}${value ? " " + val(value) : ""}`;
      pdf.text(text, cx, y);
      cx += width + gap;
    });
    y += 7;
  };

  section("DADOS DOS ADQUIRENTES (COMPRADORES)", "em caso de pluralidade preencher um para cada");
  lineField("Nome:", p.nome);
  lineField("CPF/CNPJ:", p.cpf);
  lineField("Endereço:", p.endereco);
  inline([
    { label: "Bairro:", value: c.bairroComprador || "", width: 50 },
    { label: "Cidade:", value: p.cidade || "", width: 50 },
    { label: "CEP:", value: p.cep || "", width: 40 },
  ]);
  lineField("Telefone/E-mail:", [p.telefone, p.email].filter(Boolean).join(" / "), { lineWidth: 100 });

  y += 2;
  section("DADOS DOS TRANSMITENTES (VENDEDORES)", "em caso de pluralidade preencher um para cada");
  lineField("Nome:", c.vendedorNome || "");
  lineField("CPF/CNPJ:", c.vendedorCpf || "");
  lineField("Endereço:", c.vendedorEndereco || "");
  inline([
    { label: "Bairro:", value: "", width: 50 },
    { label: "Cidade:", value: "", width: 50 },
    { label: "CEP:", value: "", width: 40 },
  ]);

  y += 2;
  section("DADOS DO IMÓVEL");
  lineField("Código do Imóvel:", c.indicacaoFiscal || c.inscricaoImobiliaria || "");
  lineField("Matrícula do RI:", c.matriculaImovel || "");
  lineField("Endereço do Imóvel:", c.enderecoImovel || "");
  inline([
    { label: "Bairro:", value: c.bairroImovel || "", width: 50 },
    { label: "Cidade:", value: opts.municipio || c.cidadeImovel || "", width: 50 },
    { label: "CEP:", value: c.cepImovel || "", width: 40 },
  ]);
  inline([
    { label: "Tipo do Imóvel:", value: "(   ) Urbano   (   ) Rural", width: 90 },
  ]);
  inline([
    { label: "Área do Terreno (m²):", value: c.areaTerreno || "", width: 70 },
    { label: "Área Construída (m²):", value: c.areaConstruida || "", width: 80 },
  ]);

  y += 2;
  section("DADOS DA TRANSAÇÃO");
  lineField("Motivo da Transferência:", c.motivoTransferencia || "", { lineWidth: 120 });
  inline([
    { label: "Tipo de Venda:", value: "(   ) Total   (   ) Parcial", width: 90 },
  ]);
  lineField("Percentual Transferido (%):", c.percentualTransferido || "", { lineWidth: 60 });
  lineField(
    "Valor Declarado da Transação (R$):",
    formatMoney(
      opts.valorContratoBanco ||
        c.valorContratoBanco ||
        c.valorContratoFinanciamento ||
        c.valorFinanciamento ||
        c.valorDeclaradoTransacao ||
        ""
    ),
    { lineWidth: 80 }
  );
  lineField("Valor Financiado (R$):", c.valorFinanciado || "", { lineWidth: 80 });
  lineField("Valor de mercado para fins de tributação de ITBI (R$):", c.valorMercadoItbi || "", { lineWidth: 90 });

  y += 2;
  section("DOCUMENTOS ANEXOS");
  [
    "(   ) Matrícula atualizada (até 30 dias)",
    "(   ) Escritura / Contrato de Compra e Venda",
    "(   ) CND do Imóvel",
    "(   ) Outros (carta de arrematação, formal de partilha e etc)",
  ].forEach((line) => {
    pdf.text(line, 18, y);
    y += 7;
  });

  y += 4;
  section("DECLARAÇÃO");
  const decl =
    "Declaro que as informações acima são verdadeiras sob as penalidades legais e estou ciente que o município poderá solicitar documentos complementares, podendo, inclusive, abrir procedimento próprio de avaliação caso constatado que o valor declarado não representa o valor real do mercado, podendo acarretar em multa de até 50% do tributo devido, conforme previsto no art. 101, §2º do CTM e jurisprudência pacificada no TEMA 1113 do STJ.";
  const declLines = pdf.splitTextToSize(decl, pageWidth - 36);
  pdf.text(declLines, 18, y);
  y += declLines.length * 6 + 8;

  lineField("Local e Data:", "", { lineWidth: 70 });
  lineField("Assinatura do Contribuinte:", "", { lineWidth: 100 });

  // Footer
  y += 6;
  pdf.line(18, y, pageWidth - 18, y);
  y += 6;
  pdf.setFontSize(10);
  pdf.text("Av. Emilio Johnson, 360 - Almirante Tamandaré, Paraná - 3699-8600", pageWidth / 2, y, { align: "center" });

  pdf.save(`${doc.fileNameBase}.pdf`);
}

function clearResults() {
  const container = document.getElementById("requirements-output");
  if (container) container.innerHTML = "";
  const alertBox = document.getElementById("requirements-missing-alert");
  if (alertBox) alertBox.classList.add("d-none");
  lastDocuments = [];
}

function updateParticipantsBadge(contract) {
  const badge = document.getElementById("requirements-participants-badge");
  if (!badge) return;
  const participants = collectParticipantsFromForm(contract);
  badge.textContent = `${participants.length} participante${participants.length === 1 ? "" : "s"}`;
}

function attachEvents() {
  const templateSelect = document.getElementById("requirements-template");
  if (templateSelect && !templateSelect.dataset.bound) {
    templateSelect.addEventListener("change", () => {
      renderTemplateOptions(templateSelect.value, collectContractContext(currentContract));
    });
    templateSelect.dataset.bound = "true";
  }

  const generateBtn = document.getElementById("requirements-generate-btn");
  if (generateBtn && !generateBtn.dataset.bound) {
    generateBtn.addEventListener("click", () => {
      const templateId = templateSelect ? templateSelect.value : "";
      const participants = collectParticipantsFromForm(currentContract);
      const context = collectContractContext(currentContract);
      const options = getTemplateOptions(templateId);
      const alertBox = document.getElementById("requirements-missing-alert");

      if (alertBox) {
        alertBox.classList.add("d-none");
        alertBox.innerHTML = "";
      }

      const missing = validate(templateId, participants, context, options);
      if (missing.length) {
        if (alertBox) {
          alertBox.innerHTML = `<strong>Preencha os campos pendentes:</strong><ul class="mb-0 mt-2">${missing
            .map((m) => `<li>${m}</li>`)
            .join("")}</ul>`;
          alertBox.classList.remove("d-none");
        }
        return;
      }

      const documents = buildDocuments(templateId, participants, context, options);
      if (!documents.length) {
        notify("Nenhum documento gerado.", "warning");
        return;
      }

      lastDocuments = documents;
      renderOutput(documents);

      const output = document.getElementById("requirements-output");
      if (output && !output.dataset.bound) {
        output.addEventListener("click", (event) => {
          const btn = event.target.closest("button[data-action]");
          if (!btn) return;
          const index = Number(btn.dataset.docIndex);
          if (btn.dataset.action === "copy") {
            handleCopy(lastDocuments, index);
          } else if (btn.dataset.action === "download-txt") {
            handleDownload(lastDocuments, index, "txt");
          } else if (btn.dataset.action === "download-doc") {
            handleDownload(lastDocuments, index, "doc");
          } else if (btn.dataset.action === "download-pdf") {
            handleDownload(lastDocuments, index, "pdf");
          }
        });
        output.dataset.bound = "true";
      }
    });
    generateBtn.dataset.bound = "true";
  }

  const clearBtn = document.getElementById("requirements-clear-btn");
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.addEventListener("click", clearResults);
    clearBtn.dataset.bound = "true";
  }
}

export function initRequirementsUI() {
  attachEvents();
  const templateSelect = document.getElementById("requirements-template");
  if (templateSelect) {
    renderTemplateOptions(templateSelect.value, collectContractContext(currentContract));
  }
}

export function renderRequirementsUI(contract, options = {}) {
  attachEvents();
  currentContract = contract || null;
  if (typeof options.notify === "function") {
    notify = options.notify;
  }
  updateParticipantsBadge(contract);
  const templateSelect = document.getElementById("requirements-template");
  if (templateSelect) {
    renderTemplateOptions(templateSelect.value, collectContractContext(contract));
  }
  const alertBox = document.getElementById("requirements-missing-alert");
  if (alertBox) {
    alertBox.classList.add("d-none");
    alertBox.innerHTML = "";
  }
}

// Inicializa automaticamente após o carregamento do DOM
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initRequirementsUI());
} else {
  initRequirementsUI();
}
