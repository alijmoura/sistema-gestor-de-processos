/**
 * Serviço Avançado de Importação/Exportação
 * Suporte a múltiplos formatos: CSV, JSON, Excel, XML
 */

class AdvancedImportExportService {
    constructor() {
        this.isInitialized = false;
        this.supportedFormats = {
            import: ['csv', 'json', 'xlsx', 'xml'],
            export: ['csv', 'json', 'xlsx', 'xml', 'pdf']
        };
        this.templates = new Map();
        this.importHistory = [];
        this.exportHistory = [];
        this.init();
    }

    async init() {
        if (this.isInitialized) return;
        
        try {
            // Carregar templates de importação/exportação
            this.loadDefaultTemplates();
            
            // Carregar histórico
            this.loadHistory();
            
            this.isInitialized = true;
            console.log(' Serviço Avançado de Import/Export inicializado');
            
        } catch (error) {
            console.error(' Erro ao inicializar serviço de import/export:', error);
        }
    }

    /**
     * Carrega templates padrão de importação/exportação
     */
    loadDefaultTemplates() {
        // Template completo
        this.templates.set('completo', {
            id: 'completo',
            nome: 'Exportação Completa',
            tipo: 'export',
            descricao: 'Exporta todos os campos disponíveis',
            campos: [
                'vendedorConstrutora',
                'empreendimento',
                'clientePrincipal',
                'clienteConjuge',
                'valorContrato',
                'entrada',
                'financiamento',
                'saldoReceber',
                'status',
                'dataAssinatura',
                'dataEntrega',
                'observacoes'
            ],
            mapeamento: {},
            validacoes: {},
            transformacoes: {}
        });

        // Template básico
        this.templates.set('basico', {
            id: 'basico',
            nome: 'Exportação Básica',
            tipo: 'export',
            descricao: 'Exporta apenas campos essenciais',
            campos: [
                'clientePrincipal',
                'empreendimento',
                'valorContrato',
                'status',
                'dataAssinatura'
            ],
            mapeamento: {},
            validacoes: {},
            transformacoes: {}
        });

        // Template de importação padrão
        this.templates.set('import_padrao', {
            id: 'import_padrao',
            nome: 'Importação Padrão',
            tipo: 'import',
            descricao: 'Template padrão para importação de contratos',
            campos: [
                'vendedorConstrutora',
                'empreendimento',
                'clientePrincipal',
                'valorContrato',
                'status',
                'dataAssinatura'
            ],
            mapeamento: {
                'Cliente': 'clientePrincipal',
                'Empreendimento': 'empreendimento',
                'Valor': 'valorContrato',
                'Data': 'dataAssinatura',
                'Status': 'status',
                'Vendedor': 'vendedorConstrutora'
            },
            validacoes: {
                'clientePrincipal': { required: true, type: 'string' },
                'valorContrato': { required: true, type: 'number', min: 0 },
                'dataAssinatura': { required: true, type: 'date' }
            },
            transformacoes: {
                'valorContrato': 'parseFloat',
                'dataAssinatura': 'parseDate'
            }
        });

        console.log(` ${this.templates.size} templates carregados`);
    }

    /**
     * Carrega histórico de operações
     */
    loadHistory() {
        try {
            const importHistory = localStorage.getItem('importHistory');
            if (importHistory) {
                this.importHistory = JSON.parse(importHistory);
            }

            const exportHistory = localStorage.getItem('exportHistory');
            if (exportHistory) {
                this.exportHistory = JSON.parse(exportHistory);
            }
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
            this.importHistory = [];
            this.exportHistory = [];
        }
    }

    /**
     * Salva histórico de operações
     */
    saveHistory() {
        try {
            localStorage.setItem('importHistory', JSON.stringify(this.importHistory));
            localStorage.setItem('exportHistory', JSON.stringify(this.exportHistory));
        } catch (error) {
            console.error('Erro ao salvar histórico:', error);
        }
    }

    /**
     * Detecta formato do arquivo
     */
    detectFileFormat(file) {
        const extension = file.name.split('.').pop().toLowerCase();

        const formatMap = {
            'csv': 'csv',
            'json': 'json',
            'xlsx': 'xlsx',
            'xls': 'xlsx',
            'xml': 'xml'
        };

        return formatMap[extension] || 'unknown';
    }

    /**
     * Valida se formato é suportado
     */
    isFormatSupported(format, operation) {
        return this.supportedFormats[operation] && 
               this.supportedFormats[operation].includes(format);
    }

    /**
     * Importa arquivo em múltiplos formatos
     */
    async importFile(file, templateId = 'import_padrao', options = {}) {
        try {
            console.log(` Iniciando importação do arquivo: ${file.name}`);
            
            const format = this.detectFileFormat(file);
            
            if (!this.isFormatSupported(format, 'import')) {
                throw new Error(`Formato ${format} não suportado para importação`);
            }

            const template = this.templates.get(templateId);
            if (!template || template.tipo !== 'import') {
                throw new Error('Template de importação inválido');
            }

            let data;
            
            // Processar arquivo baseado no formato
            switch (format) {
                case 'csv':
                    data = await this.importCSV(file, template, options);
                    break;
                case 'json':
                    data = await this.importJSON(file, template, options);
                    break;
                case 'xlsx':
                    data = await this.importExcel(file, template, options);
                    break;
                case 'xml':
                    data = await this.importXML(file, template, options);
                    break;
                default:
                    throw new Error(`Formato ${format} não implementado`);
            }

            // Validar dados
            const validationResult = this.validateImportData(data, template);
            
            if (validationResult.errors.length > 0) {
                console.warn(' Erros de validação encontrados:', validationResult.errors);
            }

            // Salvar no histórico
            this.addToImportHistory({
                fileName: file.name,
                format: format,
                template: template.nome,
                timestamp: new Date().toISOString(),
                recordsTotal: data.length,
                recordsValid: validationResult.validRecords,
                recordsInvalid: validationResult.invalidRecords,
                errors: validationResult.errors
            });

            console.log(` Importação concluída: ${validationResult.validRecords} registros válidos`);
            
            return {
                data: data,
                validation: validationResult,
                format: format,
                template: template
            };
            
        } catch (error) {
            console.error(' Erro na importação:', error);
            throw error;
        }
    }

    /**
     * Importa arquivo CSV
     */
    async importCSV(file, template, options) {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            throw new Error('Arquivo CSV vazio');
        }

        // Detectar separador
        const separator = options.separator || this.detectCSVSeparator(lines[0]);
        
        // Parse headers
        const headers = lines[0].split(separator).map(h => h.trim().replace(/"/g, ''));
        
        // Parse data
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i], separator);
            if (values.length === headers.length) {
                const record = {};
                headers.forEach((header, index) => {
                    const mappedField = template.mapeamento[header] || header;
                    record[mappedField] = values[index];
                });
                data.push(this.transformRecord(record, template));
            }
        }

        return data;
    }

    /**
     * Importa arquivo JSON
     */
    async importJSON(file, template) {
        const text = await file.text();
        const jsonData = JSON.parse(text);
        
        let data = Array.isArray(jsonData) ? jsonData : [jsonData];
        
        // Aplicar mapeamento se necessário
        if (Object.keys(template.mapeamento).length > 0) {
            data = data.map(record => {
                const mapped = {};
                Object.keys(record).forEach(key => {
                    const mappedField = template.mapeamento[key] || key;
                    mapped[mappedField] = record[key];
                });
                return this.transformRecord(mapped, template);
            });
        }

        return data;
    }

    /**
     * Importa arquivo Excel (simulado - requer biblioteca externa)
     */
    async importExcel() {
        // Para implementação real, usar biblioteca como SheetJS
        throw new Error('Importação Excel requer biblioteca adicional (SheetJS)');
    }

    /**
     * Importa arquivo XML
     */
    async importXML(file, template) {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        
        // Verificar erros de parsing
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            throw new Error('Erro ao fazer parse do XML: ' + parserError.textContent);
        }

        // Extrair dados (assumindo estrutura básica)
        const records = xmlDoc.querySelectorAll('record, item, contrato');
        const data = [];

        records.forEach(record => {
            const item = {};
            record.childNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const mappedField = template.mapeamento[node.nodeName] || node.nodeName;
                    item[mappedField] = node.textContent;
                }
            });
            data.push(this.transformRecord(item, template));
        });

        return data;
    }

    /**
     * Detecta separador CSV
     */
    detectCSVSeparator(line) {
        const separators = [',', ';', '\t', '|'];
        let maxCount = 0;
        let detectedSeparator = ',';

        separators.forEach(sep => {
            const count = (line.match(new RegExp('\\' + sep, 'g')) || []).length;
            if (count > maxCount) {
                maxCount = count;
                detectedSeparator = sep;
            }
        });

        return detectedSeparator;
    }

    /**
     * Parse linha CSV respeitando aspas
     */
    parseCSVLine(line, separator) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === separator && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
    }

    /**
     * Transforma registro baseado no template
     */
    transformRecord(record, template) {
        const transformed = { ...record };

        Object.keys(template.transformacoes || {}).forEach(field => {
            const transformation = template.transformacoes[field];
            const value = transformed[field];

            if (value !== undefined && value !== null && value !== '') {
                switch (transformation) {
                    case 'parseFloat':
                        transformed[field] = parseFloat(value.toString().replace(/[^\d.,-]/g, '').replace(',', '.'));
                        break;
                    case 'parseInt':
                        transformed[field] = parseInt(value.toString().replace(/\D/g, ''));
                        break;
                    case 'parseDate':
                        transformed[field] = this.parseDate(value);
                        break;
                    case 'uppercase':
                        transformed[field] = value.toString().toUpperCase();
                        break;
                    case 'lowercase':
                        transformed[field] = value.toString().toLowerCase();
                        break;
                    case 'trim':
                        transformed[field] = value.toString().trim();
                        break;
                }
            }
        });

        return transformed;
    }

    /**
     * Parse data flexível
     */
    parseDate(value) {
        if (!value) return null;

        // Tentar diferentes formatos
        const formats = [
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,     // DD/MM/YYYY
            /^(\d{4})-(\d{1,2})-(\d{1,2})$/,      // YYYY-MM-DD
            /^(\d{1,2})-(\d{1,2})-(\d{4})$/,      // DD-MM-YYYY
        ];

        for (const format of formats) {
            const match = value.toString().match(format);
            if (match) {
                const [, a, b, c] = match;
                // Assumir que anos de 4 dígitos vêm primeiro
                if (c.length === 4) {
                    return new Date(parseInt(c), parseInt(b) - 1, parseInt(a));
                } else {
                    return new Date(parseInt(a), parseInt(b) - 1, parseInt(c));
                }
            }
        }

        // Fallback para Date.parse
        const parsed = Date.parse(value);
        return isNaN(parsed) ? null : new Date(parsed);
    }

    /**
     * Valida dados importados
     */
    validateImportData(data, template) {
        const result = {
            validRecords: 0,
            invalidRecords: 0,
            errors: []
        };

        data.forEach((record, index) => {
            let isValid = true;
            const recordErrors = [];

            Object.keys(template.validacoes || {}).forEach(field => {
                const validation = template.validacoes[field];
                const value = record[field];

                // Required
                if (validation.required && (value === undefined || value === null || value === '')) {
                    recordErrors.push(`Linha ${index + 2}: Campo '${field}' é obrigatório`);
                    isValid = false;
                }

                // Type validation
                if (value !== undefined && value !== null && value !== '') {
                    switch (validation.type) {
                        case 'number':
                            if (isNaN(parseFloat(value))) {
                                recordErrors.push(`Linha ${index + 2}: Campo '${field}' deve ser um número`);
                                isValid = false;
                            } else {
                                const numValue = parseFloat(value);
                                if (validation.min !== undefined && numValue < validation.min) {
                                    recordErrors.push(`Linha ${index + 2}: Campo '${field}' deve ser maior que ${validation.min}`);
                                    isValid = false;
                                }
                                if (validation.max !== undefined && numValue > validation.max) {
                                    recordErrors.push(`Linha ${index + 2}: Campo '${field}' deve ser menor que ${validation.max}`);
                                    isValid = false;
                                }
                            }
                            break;
                        case 'date':
                            if (!this.parseDate(value)) {
                                recordErrors.push(`Linha ${index + 2}: Campo '${field}' deve ser uma data válida`);
                                isValid = false;
                            }
                            break;
                        case 'email':
                            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                                recordErrors.push(`Linha ${index + 2}: Campo '${field}' deve ser um email válido`);
                                isValid = false;
                            }
                            break;
                    }
                }
            });

            if (isValid) {
                result.validRecords++;
            } else {
                result.invalidRecords++;
                result.errors.push(...recordErrors);
            }
        });

        return result;
    }

    /**
     * Exporta dados em múltiplos formatos
     */
    async exportData(data, format, templateId = 'completo', options = {}) {
        try {
            console.log(` Iniciando exportação em formato: ${format}`);
            
            if (!this.isFormatSupported(format, 'export')) {
                throw new Error(`Formato ${format} não suportado para exportação`);
            }

            const template = this.templates.get(templateId);
            if (!template || template.tipo !== 'export') {
                throw new Error('Template de exportação inválido');
            }

            // Filtrar dados pelos campos do template
            const filteredData = data.map(record => {
                const filtered = {};
                template.campos.forEach(field => {
                    filtered[field] = record[field] || '';
                });
                return filtered;
            });

            let result;
            
            // Processar baseado no formato
            switch (format) {
                case 'csv':
                    result = this.exportCSV(filteredData, options);
                    break;
                case 'json':
                    result = this.exportJSON(filteredData, options);
                    break;
                case 'xlsx':
                    result = await this.exportExcel(filteredData, options);
                    break;
                case 'xml':
                    result = this.exportXML(filteredData, options);
                    break;
                case 'pdf':
                    result = await this.exportPDF(filteredData, options);
                    break;
                default:
                    throw new Error(`Formato ${format} não implementado`);
            }

            // Salvar no histórico
            this.addToExportHistory({
                format: format,
                template: template.nome,
                timestamp: new Date().toISOString(),
                recordsCount: filteredData.length,
                fileName: `export_${Date.now()}.${format}`
            });

            console.log(` Exportação concluída: ${filteredData.length} registros`);
            
            return result;
            
        } catch (error) {
            console.error(' Erro na exportação:', error);
            throw error;
        }
    }

    /**
     * Exporta para CSV
     */
    exportCSV(data, options = {}) {
        const separator = options.separator || ',';
        const includeHeaders = options.includeHeaders !== false;
        
        if (data.length === 0) {
            throw new Error('Nenhum dado para exportar');
        }

        const headers = Object.keys(data[0]);
        let csvContent = '';

        if (includeHeaders) {
            csvContent = headers.map(h => `"${h}"`).join(separator) + '\n';
        }

        data.forEach(record => {
            const values = headers.map(header => {
                const value = record[header] || '';
                return `"${value.toString().replace(/"/g, '""')}"`;
            });
            csvContent += values.join(separator) + '\n';
        });

        this.downloadFile(csvContent, 'text/csv', `export_${Date.now()}.csv`);
        return csvContent;
    }

    /**
     * Exporta para JSON
     */
    exportJSON(data, options = {}) {
        const jsonContent = JSON.stringify(data, null, options.indent || 2);
        this.downloadFile(jsonContent, 'application/json', `export_${Date.now()}.json`);
        return jsonContent;
    }

    /**
     * Exporta para Excel (simulado)
     */
    async exportExcel() {
        // Para implementação real, usar biblioteca como SheetJS
        throw new Error('Exportação Excel requer biblioteca adicional (SheetJS)');
    }

    /**
     * Exporta para XML
     */
    exportXML(data, options = {}) {
        const rootElement = options.rootElement || 'data';
        const itemElement = options.itemElement || 'record';
        
        let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootElement}>\n`;
        
        data.forEach(record => {
            xmlContent += `  <${itemElement}>\n`;
            Object.keys(record).forEach(key => {
                const value = record[key] || '';
                xmlContent += `    <${key}>${this.escapeXML(value.toString())}</${key}>\n`;
            });
            xmlContent += `  </${itemElement}>\n`;
        });
        
        xmlContent += `</${rootElement}>`;
        
        this.downloadFile(xmlContent, 'application/xml', `export_${Date.now()}.xml`);
        return xmlContent;
    }

    /**
     * Exporta para PDF (via HTML)
     */
    async exportPDF(data, options = {}) {
        const htmlContent = this.generateHTMLTable(data, options);
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        
        setTimeout(() => {
            printWindow.print();
        }, 1000);
        
        return htmlContent;
    }

    /**
     * Gera tabela HTML para PDF
     */
    generateHTMLTable(data, options = {}) {
        const title = options.title || 'Exportação de Dados';
        
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${title}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { text-align: center; margin-bottom: 30px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; font-weight: bold; }
                    .footer { margin-top: 20px; text-align: center; font-size: 12px; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${title}</h1>
                    <p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
                </div>
                
                <table>
        `;

        if (data.length > 0) {
            // Cabeçalho
            const headers = Object.keys(data[0]);
            html += '<tr>';
            headers.forEach(header => {
                html += `<th>${header}</th>`;
            });
            html += '</tr>';

            // Dados
            data.forEach(record => {
                html += '<tr>';
                headers.forEach(header => {
                    const value = record[header] || '';
                    html += `<td>${value}</td>`;
                });
                html += '</tr>';
            });
        }

        html += `
                </table>
                
                <div class="footer">
                    <p>Total de registros: ${data.length}</p>
                </div>
            </body>
            </html>
        `;

        return html;
    }

    /**
     * Escapa caracteres XML
     */
    escapeXML(str) {
        return str.replace(/[<>&'"]/g, (char) => {
            const escapeMap = {
                '<': '&lt;',
                '>': '&gt;',
                '&': '&amp;',
                "'": '&apos;',
                '"': '&quot;'
            };
            return escapeMap[char];
        });
    }

    /**
     * Download de arquivo
     */
    downloadFile(content, mimeType, fileName) {
        const blob = new Blob([content], { type: mimeType + ';charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Adiciona ao histórico de importação
     */
    addToImportHistory(item) {
        this.importHistory.unshift(item);
        if (this.importHistory.length > 50) {
            this.importHistory = this.importHistory.slice(0, 50);
        }
        this.saveHistory();
    }

    /**
     * Adiciona ao histórico de exportação
     */
    addToExportHistory(item) {
        this.exportHistory.unshift(item);
        if (this.exportHistory.length > 50) {
            this.exportHistory = this.exportHistory.slice(0, 50);
        }
        this.saveHistory();
    }

    /**
     * Obtém templates disponíveis
     */
    getTemplates(tipo = null) {
        const templates = Array.from(this.templates.values());
        return tipo ? templates.filter(t => t.tipo === tipo) : templates;
    }

    /**
     * Salva template customizado
     */
    saveTemplate(template) {
        this.templates.set(template.id, template);
        
        // Salvar templates customizados no localStorage
        const customTemplates = {};
        this.templates.forEach((template, id) => {
            if (!['completo', 'basico', 'import_padrao'].includes(id)) {
                customTemplates[id] = template;
            }
        });
        
        localStorage.setItem('customImportExportTemplates', JSON.stringify(customTemplates));
    }

    /**
     * Remove template customizado
     */
    removeTemplate(templateId) {
        if (['completo', 'basico', 'import_padrao'].includes(templateId)) {
            throw new Error('Não é possível remover templates padrão');
        }

        this.templates.delete(templateId);
        
        const customTemplates = {};
        this.templates.forEach((template, id) => {
            if (!['completo', 'basico', 'import_padrao'].includes(id)) {
                customTemplates[id] = template;
            }
        });
        
        localStorage.setItem('customImportExportTemplates', JSON.stringify(customTemplates));
    }

    /**
     * Obtém histórico de importações
     */
    getImportHistory() {
        return [...this.importHistory];
    }

    /**
     * Obtém histórico de exportações
     */
    getExportHistory() {
        return [...this.exportHistory];
    }

    /**
     * Limpa histórico
     */
    clearHistory() {
        this.importHistory = [];
        this.exportHistory = [];
        this.saveHistory();
    }

    /**
     * Obtém formatos suportados
     */
    getSupportedFormats() {
        return { ...this.supportedFormats };
    }
}

// Instância global
window.advancedImportExportService = new AdvancedImportExportService();