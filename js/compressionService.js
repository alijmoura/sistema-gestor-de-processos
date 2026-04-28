/**
 * CompressionService - Sistema de Compressão e Otimização de Assets
 * 
 * Funcionalidades:
 * - Compressão de dados JSON/texto
 * - Lazy loading inteligente de recursos
 * - Cache comprimido no localStorage
 * - Otimização de imagens
 * - Minificação dinâmica
 * - Gerenciamento de CDN
 */

// import minificationService from './minificationService.js';
const minificationService = window.minificationService;

class CompressionService {
  constructor() {
    this.compressionSupport = this.detectCompressionSupport();
    this.cache = new Map();
    this.compressedCache = new Map();
    
    // Configurações
    this.config = {
      compressionThreshold: 1024, // 1KB - mínimo para compressão
      maxCacheSize: 50 * 1024 * 1024, // 50MB
      imageQuality: 0.8,
      enableWebP: true,
      enableLazyLoading: true,
      enableMinification: true, // Habilita minificação automática
      cdnEnabled: false,
      cdnBaseUrl: '',
      preloadCritical: true
    };
    
    // Estatísticas
    this.stats = {
      totalRequests: 0,
      compressedRequests: 0,
      bytesOriginal: 0,
      bytesCompressed: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    
    // Assets críticos para preload
    this.criticalAssets = new Set([
      'js/main.js',
      'js/auth.js',
      'js/firestoreService.js',
      'css/style.css'
    ]);
    
    console.log(' CompressionService inicializado');
  }

  /**
   * Inicializa o serviço
   */
  async initialize() {
    // Detecta suporte do navegador
    this.detectBrowserCapabilities();
    
    // Configura interceptadores
    this.setupInterceptors();
    
    // Preload de assets críticos
    if (this.config.preloadCritical) {
      await this.preloadCriticalAssets();
    }
    
    // Configura lazy loading
    if (this.config.enableLazyLoading) {
      this.setupLazyLoading();
    }
    
    // Otimiza cache existente
    this.optimizeExistingCache();
    
    console.log(' CompressionService inicializado completamente');
  }

  /**
   * Detecta suporte a compressão
   */
  detectCompressionSupport() {
    const support = {
      gzip: false,
      deflate: false,
      brotli: false,
      compressionStreams: false
    };

    // Verifica compression streams API
    if ('CompressionStream' in window && 'DecompressionStream' in window) {
      support.compressionStreams = true;
      support.gzip = true;
      support.deflate = true;
    }
    
    // Verifica suporte brotli
    if ('CompressionStream' in window) {
      try {
        new CompressionStream('gzip');
        support.gzip = true;
      } catch {
        // Não suportado
      }
    }

    return support;
  }

  /**
   * Detecta capacidades do navegador
   */
  detectBrowserCapabilities() {
    // WebP support
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    this.config.enableWebP = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    
    // Service Worker support
    this.serviceWorkerSupported = 'serviceWorker' in navigator;
    
    // Intersection Observer support
    this.intersectionObserverSupported = 'IntersectionObserver' in window;
    
    console.log(` Capacidades detectadas: WebP: ${this.config.enableWebP}, SW: ${this.serviceWorkerSupported}`);
  }

  /**
   * Comprime dados usando algoritmo disponível
   */
  async compressData(data, algorithm = 'gzip', contentType = 'auto') {
    if (!data || data.length < this.config.compressionThreshold) {
      return { compressed: data, isCompressed: false, originalSize: data.length };
    }

    this.stats.totalRequests++;
    let processedData = data;
    
    // Aplica minificação se apropriado
    if (this.config.enableMinification && typeof data === 'string') {
      processedData = minificationService.minify(data, contentType);
    }
    
    const originalSize = new Blob([processedData]).size;
    this.stats.bytesOriginal += originalSize;

    try {
      if (this.compressionSupport.compressionStreams && algorithm === 'gzip') {
        const compressed = await this.compressWithStreams(processedData, 'gzip');
        this.stats.compressedRequests++;
        this.stats.bytesCompressed += compressed.length;
        
        return {
          compressed,
          isCompressed: true,
          originalSize,
          compressedSize: compressed.length,
          algorithm: 'gzip',
          minified: processedData !== data
        };
      }
      
      // Fallback para compressão simples
      const compressed = this.simpleCompress(processedData);
      this.stats.compressedRequests++;
      this.stats.bytesCompressed += compressed.length;
      
      return {
        compressed,
        isCompressed: true,
        originalSize,
        compressedSize: compressed.length,
        algorithm: 'simple',
        minified: processedData !== data
      };
      
    } catch (error) {
      console.warn('Erro na compressão, usando dados originais:', error);
      return { compressed: processedData, isCompressed: false, originalSize };
    }
  }

  /**
   * Comprime usando Compression Streams API
   */
  async compressWithStreams(data, algorithm) {
    const stream = new CompressionStream(algorithm);
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    
    const chunks = [];
    
    // Inicia leitura
    const readPromise = (async () => {
      let result;
      while (!(result = await reader.read()).done) {
        chunks.push(result.value);
      }
    })();
    
    // Escreve dados
    const encoder = new TextEncoder();
    await writer.write(encoder.encode(data));
    await writer.close();
    
    // Aguarda conclusão
    await readPromise;
    
    // Converte chunks para string base64
    const compressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
    let offset = 0;
    chunks.forEach(chunk => {
      compressed.set(chunk, offset);
      offset += chunk.length;
    });
    
    return btoa(String.fromCharCode(...compressed));
  }

  /**
   * Compressão simples usando LZ-string like
   */
  simpleCompress(data) {
    // Implementação simples de compressão
    const dict = {};
    const result = [];
    let dictSize = 256;
    let w = '';

    for (let i = 0; i < data.length; i++) {
      const c = data.charAt(i);
      const wc = w + c;
      
      if (dict[wc]) {
        w = wc;
      } else {
        result.push(dict[w] || w.charCodeAt(0));
        dict[wc] = dictSize++;
        w = c;
      }
    }
    
    if (w !== '') {
      result.push(dict[w] || w.charCodeAt(0));
    }
    
    return JSON.stringify(result);
  }

  /**
   * Descomprime dados
   */
  async decompressData(compressedData, metadata) {
    if (!metadata.isCompressed) {
      return compressedData;
    }

    try {
      if (metadata.algorithm === 'gzip' && this.compressionSupport.compressionStreams) {
        return await this.decompressWithStreams(compressedData, 'gzip');
      }
      
      if (metadata.algorithm === 'simple') {
        return this.simpleDecompress(compressedData);
      }
      
      return compressedData;
    } catch (error) {
      console.warn('Erro na descompressão:', error);
      return compressedData;
    }
  }

  /**
   * Descomprime usando Decompression Streams API
   */
  async decompressWithStreams(compressedData, algorithm) {
    const binaryString = atob(compressedData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const stream = new DecompressionStream(algorithm);
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    
    const chunks = [];
    
    // Inicia leitura
    const readPromise = (async () => {
      let result;
      while (!(result = await reader.read()).done) {
        chunks.push(result.value);
      }
    })();
    
    // Escreve dados comprimidos
    await writer.write(bytes);
    await writer.close();
    
    // Aguarda conclusão
    await readPromise;
    
    // Converte chunks para string
    const decoder = new TextDecoder();
    return chunks.map(chunk => decoder.decode(chunk)).join('');
  }

  /**
   * Descompressão simples
   */
  simpleDecompress(compressedData) {
    try {
      const compressed = JSON.parse(compressedData);
      const dict = {};
      let dictSize = 256;
      let w = String.fromCharCode(compressed[0]);
      let result = w;

      for (let i = 1; i < compressed.length; i++) {
        let k = compressed[i];
        let entry = dict[k] || (k === dictSize ? w + w.charAt(0) : null);
        
        if (entry === null) {
          entry = String.fromCharCode(k);
        }
        
        result += entry;
        dict[dictSize++] = w + entry.charAt(0);
        w = entry;
      }
      
      return result;
    } catch (error) {
      console.warn('Erro na descompressão simples:', error);
      return compressedData;
    }
  }

  /**
   * Cache comprimido no localStorage
   */
  async setCompressedCache(key, data, ttl = 3600000) { // 1 hora default
    try {
      const serialized = JSON.stringify(data);
      const compressed = await this.compressData(serialized);
      
      const cacheEntry = {
        data: compressed.compressed,
        metadata: {
          isCompressed: compressed.isCompressed,
          algorithm: compressed.algorithm,
          originalSize: compressed.originalSize,
          compressedSize: compressed.compressedSize,
          timestamp: Date.now(),
          ttl
        }
      };
      
      localStorage.setItem(`compressed_${key}`, JSON.stringify(cacheEntry));
      this.compressedCache.set(key, cacheEntry);
      
      return true;
    } catch (error) {
      console.warn(`Erro ao salvar cache comprimido para ${key}:`, error);
      return false;
    }
  }

  /**
   * Recupera cache comprimido
   */
  async getCompressedCache(key) {
    try {
      let cacheEntry = this.compressedCache.get(key);
      
      if (!cacheEntry) {
        const stored = localStorage.getItem(`compressed_${key}`);
        if (stored) {
          cacheEntry = JSON.parse(stored);
          this.compressedCache.set(key, cacheEntry);
        }
      }
      
      if (!cacheEntry) {
        this.stats.cacheMisses++;
        return null;
      }
      
      // Verifica TTL
      if (Date.now() - cacheEntry.metadata.timestamp > cacheEntry.metadata.ttl) {
        this.removeCompressedCache(key);
        this.stats.cacheMisses++;
        return null;
      }
      
      // Descomprime dados
      const decompressed = await this.decompressData(cacheEntry.data, cacheEntry.metadata);
      const parsed = JSON.parse(decompressed);
      
      this.stats.cacheHits++;
      return parsed;
      
    } catch (error) {
      console.warn(`Erro ao recuperar cache comprimido para ${key}:`, error);
      this.stats.cacheMisses++;
      return null;
    }
  }

  /**
   * Remove cache comprimido
   */
  removeCompressedCache(key) {
    localStorage.removeItem(`compressed_${key}`);
    this.compressedCache.delete(key);
  }

  /**
   * Otimiza imagens automaticamente
   */
  async optimizeImage(imageElement, options = {}) {
    const {
      quality = this.config.imageQuality,
      maxWidth = 1920,
      maxHeight = 1080,
      format = 'auto'
    } = options;

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      imageElement.onload = () => {
        // Calcula dimensões otimizadas
        let { width, height } = this.calculateOptimalDimensions(
          imageElement.naturalWidth,
          imageElement.naturalHeight,
          maxWidth,
          maxHeight
        );
        
        canvas.width = width;
        canvas.height = height;
        
        // Desenha imagem redimensionada
        ctx.drawImage(imageElement, 0, 0, width, height);
        
        // Determina formato
        let outputFormat = 'image/jpeg';
        if (format === 'auto') {
          outputFormat = this.config.enableWebP ? 'image/webp' : 'image/jpeg';
        } else if (format === 'webp' && this.config.enableWebP) {
          outputFormat = 'image/webp';
        }
        
        // Converte para blob otimizado
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          resolve({
            url,
            blob,
            format: outputFormat,
            originalSize: imageElement.src.length,
            optimizedSize: blob.size,
            compressionRatio: (1 - blob.size / imageElement.src.length) * 100
          });
        }, outputFormat, quality);
      };
    });
  }

  /**
   * Calcula dimensões otimais
   */
  calculateOptimalDimensions(originalWidth, originalHeight, maxWidth, maxHeight) {
    let width = originalWidth;
    let height = originalHeight;
    
    // Redimensiona proporcionalmente se necessário
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
    }
    
    return { width, height };
  }

  /**
   * Lazy loading inteligente
   */
  setupLazyLoading() {
    if (!this.intersectionObserverSupported) {
      // Fallback para scroll event
      this.setupScrollLazyLoading();
      return;
    }

    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.loadLazyImage(entry.target);
          imageObserver.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '50px' // Carrega 50px antes de entrar no viewport
    });

    // Observa todas as imagens lazy
    document.querySelectorAll('img[data-lazy]').forEach(img => {
      imageObserver.observe(img);
    });
    
    console.log(' Lazy loading configurado para imagens');
  }

  /**
   * Fallback para lazy loading via scroll
   */
  setupScrollLazyLoading() {
    const lazyImages = document.querySelectorAll('img[data-lazy]');
    
    const loadImagesInView = () => {
      lazyImages.forEach(img => {
        if (this.isInViewport(img)) {
          this.loadLazyImage(img);
        }
      });
    };
    
    let ticking = false;
    const scrollHandler = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          loadImagesInView();
          ticking = false;
        });
        ticking = true;
      }
    };
    
    window.addEventListener('scroll', scrollHandler);
    window.addEventListener('resize', scrollHandler);
    
    // Carrega imagens iniciais
    loadImagesInView();
  }

  /**
   * Carrega imagem lazy
   */
  async loadLazyImage(img) {
    const src = img.dataset.lazy;
    if (!src) return;

    // Mostra placeholder de loading
    img.style.filter = 'blur(5px)';
    
    try {
      // Verifica cache primeiro
      const cached = await this.getCompressedCache(`img_${src}`);
      if (cached) {
        img.src = cached.url;
        this.animateImageLoad(img);
        return;
      }
      
      // Carrega imagem
      const tempImg = new Image();
      tempImg.onload = async () => {
        // Otimiza se necessário
        if (this.shouldOptimizeImage(tempImg)) {
          const optimized = await this.optimizeImage(tempImg);
          img.src = optimized.url;
          
          // Cache resultado otimizado
          await this.setCompressedCache(`img_${src}`, {
            url: optimized.url,
            size: optimized.optimizedSize
          });
        } else {
          img.src = src;
        }
        
        this.animateImageLoad(img);
      };
      
      tempImg.onerror = () => {
        img.src = src; // Fallback para original
        this.animateImageLoad(img);
      };
      
      tempImg.src = src;
      
    } catch (error) {
      console.warn('Erro no lazy loading:', error);
      img.src = src;
      this.animateImageLoad(img);
    }
  }

  /**
   * Anima carregamento de imagem
   */
  animateImageLoad(img) {
    img.style.transition = 'filter 0.3s ease';
    img.style.filter = 'blur(0px)';
    img.removeAttribute('data-lazy');
  }

  /**
   * Verifica se deve otimizar imagem
   */
  shouldOptimizeImage(img) {
    const maxFileSize = 500 * 1024; // 500KB
    const maxDimensions = 1920; // px
    
    return img.naturalWidth > maxDimensions || 
           img.naturalHeight > maxDimensions ||
           img.src.length > maxFileSize;
  }

  /**
   * Verifica se elemento está no viewport
   */
  isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }

  /**
   * Preload de assets críticos
   */
  async preloadCriticalAssets() {
    console.log(' Iniciando preload de assets críticos...');
    
    const preloadPromises = Array.from(this.criticalAssets).map(async (asset) => {
      try {
        // Verifica cache primeiro
        const cached = await this.getCompressedCache(`asset_${asset}`);
        if (cached) {
          return { asset, status: 'cached' };
        }
        
        // Faz preload
        const response = await fetch(asset);
        const text = await response.text();
        
        // Comprime e cacheia
        await this.setCompressedCache(`asset_${asset}`, { content: text });
        
        return { asset, status: 'preloaded', size: text.length };
      } catch (error) {
        console.warn(`Erro no preload de ${asset}:`, error);
        return { asset, status: 'error' };
      }
    });
    
    const results = await Promise.all(preloadPromises);
    console.log(' Preload concluído:', results);
  }

  /**
   * Configura interceptadores de fetch
   */
  setupInterceptors() {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const [url, options] = args;
      
      // Verifica se deve interceptar
      if (this.shouldInterceptRequest(url, options)) {
        return this.interceptedFetch(url, options, originalFetch);
      }
      
      return originalFetch(...args);
    };
  }

  /**
   * Verifica se deve interceptar requisição
   */
  shouldInterceptRequest(url, options) {
    // Intercepta apenas GET requests para recursos estáticos
    if (options?.method && options.method !== 'GET') return false;
    
    // Verifica extensões de arquivos
    const staticExtensions = ['.js', '.css', '.json', '.txt'];
    return staticExtensions.some(ext => url.includes(ext));
  }

  /**
   * Fetch interceptado com compressão
   */
  async interceptedFetch(url, options, originalFetch) {
    const cacheKey = `fetch_${url}`;
    
    // Verifica cache comprimido
    const cached = await this.getCompressedCache(cacheKey);
    if (cached) {
      return new Response(cached.content, {
        status: 200,
        statusText: 'OK (from compressed cache)',
        headers: { 'Content-Type': cached.contentType || 'text/plain' }
      });
    }
    
    // Faz requisição original
    const response = await originalFetch(url, options);
    
    if (response.ok) {
      const clone = response.clone();
      const content = await clone.text();
      
      // Cacheia resposta comprimida
      await this.setCompressedCache(cacheKey, {
        content,
        contentType: response.headers.get('content-type')
      });
    }
    
    return response;
  }

  /**
   * Otimiza cache existente
   */
  optimizeExistingCache() {
    const totalSize = this.getLocalStorageSize();
    
    if (totalSize > this.config.maxCacheSize) {
      console.log(' Limpando cache excedente...');
      this.cleanupOldCache();
    }
  }

  /**
   * Obtém tamanho do localStorage
   */
  getLocalStorageSize() {
    let total = 0;
    for (let key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        total += localStorage[key].length + key.length;
      }
    }
    return total;
  }

  /**
   * Limpa cache antigo
   */
  cleanupOldCache() {
    const cacheKeys = Object.keys(localStorage)
      .filter(key => key.startsWith('compressed_'))
      .map(key => {
        try {
          const data = JSON.parse(localStorage[key]);
          return {
            key,
            timestamp: data.metadata?.timestamp || 0
          };
        } catch {
          return { key, timestamp: 0 };
        }
      })
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // Remove 25% dos mais antigos
    const toRemove = Math.floor(cacheKeys.length * 0.25);
    cacheKeys.slice(0, toRemove).forEach(({ key }) => {
      localStorage.removeItem(key);
    });
    
    console.log(` Removidas ${toRemove} entradas antigas do cache`);
  }

  /**
   * Obtém estatísticas
   */
  getStats() {
    const efficiency = this.stats.totalRequests > 0 
      ? (this.stats.compressedRequests / this.stats.totalRequests) * 100 
      : 0;
      
    const compressionRatio = this.stats.bytesOriginal > 0
      ? ((this.stats.bytesOriginal - this.stats.bytesCompressed) / this.stats.bytesOriginal) * 100
      : 0;
      
    const cacheHitRate = (this.stats.cacheHits + this.stats.cacheMisses) > 0
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100
      : 0;

    return {
      ...this.stats,
      compressionEfficiency: efficiency,
      compressionRatio,
      cacheHitRate,
      localStorageSize: this.getLocalStorageSize(),
      compressionSupport: this.compressionSupport,
      config: this.config
    };
  }

  /**
   * Força limpeza completa
   */
  clearAllCache() {
    Object.keys(localStorage)
      .filter(key => key.startsWith('compressed_'))
      .forEach(key => localStorage.removeItem(key));
      
    this.compressedCache.clear();
    this.cache.clear();
    
    console.log(' Cache de compressão limpo completamente');
  }
}

// Instância global
const compressionService = new CompressionService();
window.compressionService = compressionService;

// export default compressionService; // Removido para compatibilidade