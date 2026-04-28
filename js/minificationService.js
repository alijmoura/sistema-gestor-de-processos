/**
 * MinificationService - Sistema de Minificação Automática
 * 
 * Funcionalidades:
 * - Minificação de CSS/JS em runtime
 * - Remoção de comentários e espaços
 * - Otimização de código
 * - Cache de arquivos minificados
 * - Compressão de HTML inline
 */

class MinificationService {
  constructor() {
    this.minifiedCache = new Map();
    this.isEnabled = true;
    
    // Configurações
    this.config = {
      minifyCSS: true,
      minifyJS: true,
      minifyHTML: true,
      removeComments: true,
      removeWhitespace: true,
      optimizeImages: true,
      preserveImportant: true,
      aggressiveMinification: false
    };
    
    // Estatísticas
    this.stats = {
      cssMinified: 0,
      jsMinified: 0,
      htmlMinified: 0,
      totalSaved: 0,
      averageReduction: 0
    };
    
    console.log(' MinificationService inicializado');
  }

  /**
   * Inicializa o serviço
   */
  initialize() {
    if (!this.isEnabled) return;
    
    // Intercepta adição de elementos CSS/JS
    this.interceptStyleElements();
    this.interceptScriptElements();
    
    // Minifica conteúdo existente
    this.minifyExistingContent();
    
    console.log(' MinificationService ativo');
  }

  /**
   * Minifica CSS
   */
  minifyCSS(cssText) {
    if (!this.config.minifyCSS || !cssText) return cssText;
    
    const originalSize = cssText.length;
    let minified = cssText;
    
    try {
      // Remove comentários (preserva importantes se configurado)
      if (this.config.removeComments) {
        if (this.config.preserveImportant) {
          minified = minified.replace(/\/\*(?!\s*!)([\s\S]*?)\*\//g, '');
        } else {
          minified = minified.replace(/\/\*([\s\S]*?)\*\//g, '');
        }
      }
      
      // Remove espaços em branco desnecessários
      if (this.config.removeWhitespace) {
        minified = minified
          .replace(/\s+/g, ' ')                    // Múltiplos espaços -> um espaço
          .replace(/\s*{\s*/g, '{')                // Espaços em torno de {
          .replace(/;\s*/g, ';')                   // Espaços após ;
          .replace(/\s*}\s*/g, '}')                // Espaços em torno de }
          .replace(/\s*,\s*/g, ',')                // Espaços em torno de ,
          .replace(/\s*:\s*/g, ':')                // Espaços em torno de :
          .replace(/;\s*}/g, '}')                  // ; antes de }
          .replace(/\s*>\s*/g, '>')                // Espaços em torno de >
          .replace(/\s*\+\s*/g, '+')               // Espaços em torno de +
          .replace(/\s*~\s*/g, '~');               // Espaços em torno de ~
      }
      
      // Otimizações agressivas
      if (this.config.aggressiveMinification) {
        minified = this.aggressiveCSSOptimization(minified);
      }
      
      // Remove espaços no início e fim
      minified = minified.trim();
      
      // Atualiza estatísticas
      const savedBytes = originalSize - minified.length;
      this.stats.cssMinified++;
      this.stats.totalSaved += savedBytes;
      this.updateAverageReduction(originalSize, minified.length);
      
      return minified;
      
    } catch (error) {
      console.warn('Erro na minificação CSS:', error);
      return cssText;
    }
  }

  /**
   * Otimização agressiva de CSS
   */
  aggressiveCSSOptimization(css) {
    return css
      // Converte cores hex longas para curtas
      .replace(/#([a-f0-9])\1([a-f0-9])\2([a-f0-9])\3/gi, '#$1$2$3')
      // Remove zeros desnecessários
      .replace(/(\s|:)0+\.(\d+)/g, '$1.$2')
      .replace(/(\s|:)0+(px|em|rem|%|pt|pc|in|mm|cm|ex)/g, '$10')
      // Remove unidades desnecessárias do zero
      .replace(/:0(px|em|rem|%|pt|pc|in|mm|cm|ex)/g, ':0')
      // Simplifica margin/padding
      .replace(/margin:\s*0\s+0\s+0\s+0/g, 'margin:0')
      .replace(/padding:\s*0\s+0\s+0\s+0/g, 'padding:0')
      // Remove quotes desnecessárias
      .replace(/url\(['"]([^'"()]*)['"]\)/g, 'url($1)');
  }

  /**
   * Minifica JavaScript
   */
  minifyJS(jsText) {
    if (!this.config.minifyJS || !jsText) return jsText;
    
    const originalSize = jsText.length;
    let minified = jsText;
    
    try {
      // Remove comentários de linha
      if (this.config.removeComments) {
        minified = minified
          .replace(/\/\/.*$/gm, '')               // Comentários //
          .replace(/\/\*[\s\S]*?\*\//g, '');     // Comentários /* */
      }
      
      // Remove espaços em branco desnecessários
      if (this.config.removeWhitespace) {
        minified = minified
          .replace(/\s+/g, ' ')                   // Múltiplos espaços
          .replace(/\s*{\s*/g, '{')               // Espaços em torno de {
          .replace(/\s*}\s*/g, '}')               // Espaços em torno de }
          .replace(/\s*;\s*/g, ';')               // Espaços em torno de ;
          .replace(/\s*,\s*/g, ',')               // Espaços em torno de ,
          .replace(/\s*\(\s*/g, '(')              // Espaços em torno de (
          .replace(/\s*\)\s*/g, ')')              // Espaços em torno de )
          .replace(/\s*=\s*/g, '=')               // Espaços em torno de =
          .replace(/\s*\+\s*/g, '+')              // Espaços em torno de +
          .replace(/\s*-\s*/g, '-')               // Espaços em torno de -
          .replace(/\s*\*\s*/g, '*')              // Espaços em torno de *
          .replace(/\s*\/\s*/g, '/')              // Espaços em torno de /
          .replace(/\s*<\s*/g, '<')               // Espaços em torno de <
          .replace(/\s*>\s*/g, '>')               // Espaços em torno de >
          .replace(/\s*&\s*/g, '&')               // Espaços em torno de &
          .replace(/\s*\|\s*/g, '|');             // Espaços em torno de |
      }
      
      // Otimizações específicas do JavaScript
      if (this.config.aggressiveMinification) {
        minified = this.aggressiveJSOptimization(minified);
      }
      
      // Remove espaços no início e fim
      minified = minified.trim();
      
      // Atualiza estatísticas
      const savedBytes = originalSize - minified.length;
      this.stats.jsMinified++;
      this.stats.totalSaved += savedBytes;
      this.updateAverageReduction(originalSize, minified.length);
      
      return minified;
      
    } catch (error) {
      console.warn('Erro na minificação JS:', error);
      return jsText;
    }
  }

  /**
   * Otimização agressiva de JavaScript
   */
  aggressiveJSOptimization(js) {
    return js
      // Remove console.log em produção
      .replace(/console\.log\([^)]*\);?/g, '')
      // Remove console.debug
      .replace(/console\.debug\([^)]*\);?/g, '')
      // Remove debugger statements
      .replace(/debugger;?/g, '')
      // Simplifica boolean operations
      .replace(/\s*===\s*true/g, '')
      .replace(/\s*!==\s*false/g, '')
      // Remove trailing semicolons antes de }
      .replace(/;\s*}/g, '}');
  }

  /**
   * Minifica HTML
   */
  minifyHTML(htmlText) {
    if (!this.config.minifyHTML || !htmlText) return htmlText;
    
    const originalSize = htmlText.length;
    let minified = htmlText;
    
    try {
      // Remove comentários HTML
      if (this.config.removeComments) {
        minified = minified.replace(/<!--[\s\S]*?-->/g, '');
      }
      
      // Remove espaços desnecessários
      if (this.config.removeWhitespace) {
        minified = minified
          .replace(/>\s+</g, '><')                // Espaços entre tags
          .replace(/\s+/g, ' ')                   // Múltiplos espaços
          .replace(/\s*=\s*/g, '=')               // Espaços em torno de =
          .replace(/\s+>/g, '>')                  // Espaços antes de >
          .replace(/\s{2,}/g, ' ');               // Múltiplos espaços -> um
      }
      
      // Remove atributos vazios desnecessários
      minified = minified
        .replace(/\s(class|id|style)=""/g, '')
        .replace(/\s(disabled|checked|selected)=""/g, ' $1');
      
      // Remove espaços no início e fim
      minified = minified.trim();
      
      // Atualiza estatísticas
      const savedBytes = originalSize - minified.length;
      this.stats.htmlMinified++;
      this.stats.totalSaved += savedBytes;
      this.updateAverageReduction(originalSize, minified.length);
      
      return minified;
      
    } catch (error) {
      console.warn('Erro na minificação HTML:', error);
      return htmlText;
    }
  }

  /**
   * Intercepta elementos style
   */
  interceptStyleElements() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.tagName === 'STYLE' && node.textContent) {
            const minified = this.minifyCSS(node.textContent);
            if (minified !== node.textContent) {
              node.textContent = minified;
            }
          }
          
          // Intercepta link CSS
          if (node.tagName === 'LINK' && node.rel === 'stylesheet') {
            this.interceptCSSLink(node);
          }
        });
      });
    });
    
    observer.observe(document.head, { childList: true, subtree: true });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Intercepta elementos script
   */
  interceptScriptElements() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.tagName === 'SCRIPT' && node.textContent && !node.src) {
            const minified = this.minifyJS(node.textContent);
            if (minified !== node.textContent) {
              node.textContent = minified;
            }
          }
        });
      });
    });
    
    observer.observe(document.head, { childList: true, subtree: true });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Intercepta links CSS
   */
  async interceptCSSLink(linkElement) {
    if (!linkElement.href) return;
    
    const cacheKey = `css_${linkElement.href}`;
    
    // Verifica cache
    if (this.minifiedCache.has(cacheKey)) {
      this.replaceLinkWithStyle(linkElement, this.minifiedCache.get(cacheKey));
      return;
    }
    
    try {
      // Baixa CSS
      const response = await fetch(linkElement.href);
      const cssText = await response.text();
      
      // Minifica
      const minified = this.minifyCSS(cssText);
      
      // Cache resultado
      this.minifiedCache.set(cacheKey, minified);
      
      // Substitui link por style inline
      this.replaceLinkWithStyle(linkElement, minified);
      
    } catch (error) {
      console.warn('Erro ao interceptar CSS link:', error);
    }
  }

  /**
   * Substitui link por style inline
   */
  replaceLinkWithStyle(linkElement, cssText) {
    const styleElement = document.createElement('style');
    styleElement.textContent = cssText;
    styleElement.dataset.originalHref = linkElement.href;
    
    linkElement.parentNode.replaceChild(styleElement, linkElement);
  }

  /**
   * Minifica conteúdo existente
   */
  minifyExistingContent() {
    // Minifica estilos existentes
    document.querySelectorAll('style').forEach(style => {
      if (style.textContent) {
        const minified = this.minifyCSS(style.textContent);
        if (minified !== style.textContent) {
          style.textContent = minified;
        }
      }
    });
    
    // Minifica scripts inline existentes
    document.querySelectorAll('script:not([src])').forEach(script => {
      if (script.textContent) {
        const minified = this.minifyJS(script.textContent);
        if (minified !== script.textContent) {
          script.textContent = minified;
        }
      }
    });
  }

  /**
   * Atualiza média de redução
   */
  updateAverageReduction(originalSize, minifiedSize) {
    const reduction = ((originalSize - minifiedSize) / originalSize) * 100;
    const totalItems = this.stats.cssMinified + this.stats.jsMinified + this.stats.htmlMinified;
    
    this.stats.averageReduction = ((this.stats.averageReduction * (totalItems - 1)) + reduction) / totalItems;
  }

  /**
   * Minifica string genérica
   */
  minify(content, type = 'auto') {
    if (!content) return content;
    
    // Auto-detecta tipo se não especificado
    if (type === 'auto') {
      if (content.includes('<!DOCTYPE') || content.includes('<html')) {
        type = 'html';
      } else if (content.includes('{') && content.includes('}') && 
                 (content.includes('color:') || content.includes('margin:'))) {
        type = 'css';
      } else if (content.includes('function') || content.includes('var ') || 
                 content.includes('const ') || content.includes('let ')) {
        type = 'js';
      }
    }
    
    switch (type) {
      case 'css':
        return this.minifyCSS(content);
      case 'js':
        return this.minifyJS(content);
      case 'html':
        return this.minifyHTML(content);
      default:
        return content;
    }
  }

  /**
   * Obtém arquivo minificado do cache
   */
  getCachedMinified(key) {
    return this.minifiedCache.get(key);
  }

  /**
   * Armazena arquivo minificado no cache
   */
  setCachedMinified(key, content) {
    this.minifiedCache.set(key, content);
  }

  /**
   * Limpa cache de minificação
   */
  clearCache() {
    this.minifiedCache.clear();
    console.log(' Cache de minificação limpo');
  }

  /**
   * Habilita/desabilita minificação
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(` Minificação ${enabled ? 'habilitada' : 'desabilitada'}`);
  }

  /**
   * Configura opções de minificação
   */
  configure(options) {
    Object.assign(this.config, options);
    console.log(' Configuração de minificação atualizada:', this.config);
  }

  /**
   * Obtém estatísticas
   */
  getStats() {
    const totalFiles = this.stats.cssMinified + this.stats.jsMinified + this.stats.htmlMinified;
    
    return {
      ...this.stats,
      totalFiles,
      cacheSize: this.minifiedCache.size,
      averageReductionFormatted: `${this.stats.averageReduction.toFixed(2)}%`,
      totalSavedFormatted: this.formatBytes(this.stats.totalSaved),
      config: this.config
    };
  }

  /**
   * Formata bytes para leitura humana
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Exporta configuração
   */
  exportConfig() {
    return {
      config: this.config,
      stats: this.getStats(),
      cacheKeys: Array.from(this.minifiedCache.keys())
    };
  }

  /**
   * Importa configuração
   */
  importConfig(exportedConfig) {
    if (exportedConfig.config) {
      this.config = { ...this.config, ...exportedConfig.config };
    }
    
    console.log(' Configuração de minificação importada');
  }

  /**
   * Reset completo
   */
  reset() {
    this.minifiedCache.clear();
    this.stats = {
      cssMinified: 0,
      jsMinified: 0,
      htmlMinified: 0,
      totalSaved: 0,
      averageReduction: 0
    };
    
    console.log(' MinificationService resetado');
  }
}

// Instância global
const minificationService = new MinificationService();
window.minificationService = minificationService;

// export default minificationService; // Removido para compatibilidade