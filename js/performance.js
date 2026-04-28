/**
 * @file performance.js
 * @description Módulo para otimizações de performance da aplicação
 */

/**
 * Lazy loading para imagens
 */
export function initializeLazyLoading() {
    if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy-placeholder');
                    imageObserver.unobserve(img);
                }
            });
        });

        document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    }
}

/**
 * Debounce para eventos frequentes
 */
export function debounce(func, wait, immediate) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func(...args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func(...args);
    };
}

/**
 * Throttle para eventos de scroll/resize
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Preload de recursos críticos
 */
export function preloadCriticalResources() {
    const criticalResources = [
        'css/style.css',
        'js/main.js',
        'images/logobarra.png'
    ];

    criticalResources.forEach(resource => {
        const link = document.createElement('link');
        if (resource.endsWith('.js')) {
            link.rel = 'modulepreload';
        } else {
            link.rel = 'preload';
        }

        if (resource.endsWith('.css')) {
            link.as = 'style';
        } else if (resource.endsWith('.js')) {
            link.as = 'script';
        } else if (resource.match(/\.(png|jpg|jpeg|gif|webp)$/)) {
            link.as = 'image';
        }
        
        link.href = resource;
        document.head.appendChild(link);
    });
}

/**
 * Otimização de renderização usando requestAnimationFrame
 */
export function scheduleRender(callback) {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            callback();
            resolve();
        });
    });
}

/**
 * Cache de elementos DOM para evitar re-queries
 */
class DOMCache {
    constructor() {
        this.cache = new Map();
    }

    get(selector) {
        if (!this.cache.has(selector)) {
            this.cache.set(selector, document.querySelector(selector));
        }
        return this.cache.get(selector);
    }

    getAll(selector) {
        const cacheKey = `all:${selector}`;
        if (!this.cache.has(cacheKey)) {
            this.cache.set(cacheKey, document.querySelectorAll(selector));
        }
        return this.cache.get(cacheKey);
    }

    clear() {
        this.cache.clear();
    }
}

function sanitizeResourceName(resourceName) {
    if (typeof resourceName !== 'string' || resourceName.length === 0) {
        return '';
    }

    try {
        const parsed = new URL(resourceName, window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return `${parsed.origin}${parsed.pathname}`;
        }
        return parsed.pathname || resourceName;
    } catch {
        return resourceName
            .replace(/(authorization=)[^&]+/ig, '$1[redacted]')
            .replace(/(bearer%20)[^&]+/ig, '$1[redacted]')
            .replace(/(token=)[^&]+/ig, '$1[redacted]')
            .replace(/(access_token=)[^&]+/ig, '$1[redacted]');
    }
}

export const domCache = new DOMCache();

/**
 * Virtual scrolling para listas grandes
 */
export class VirtualScrollList {
    constructor(container, items, renderItem, itemHeight = 50) {
        this.container = container;
        this.items = items;
        this.renderItem = renderItem;
        this.itemHeight = itemHeight;
        this.visibleItems = Math.ceil(container.clientHeight / itemHeight) + 2;
        this.scrollTop = 0;
        
        this.init();
    }

    init() {
        this.container.style.position = 'relative';
        this.container.style.overflowY = 'auto';
        
        // Container para todos os itens (para manter o scroll correto)
        this.totalHeight = this.items.length * this.itemHeight;
        this.container.style.height = `${Math.min(this.totalHeight, 400)}px`;
        
        // Container para itens visíveis
        this.visibleContainer = document.createElement('div');
        this.visibleContainer.style.position = 'absolute';
        this.visibleContainer.style.top = '0';
        this.visibleContainer.style.width = '100%';
        this.container.appendChild(this.visibleContainer);
        
        // Spacer para manter altura total
        this.spacer = document.createElement('div');
        this.spacer.style.height = `${this.totalHeight}px`;
        this.container.appendChild(this.spacer);
        
        this.container.addEventListener('scroll', this.handleScroll.bind(this));
        this.render();
    }

    handleScroll() {
        this.scrollTop = this.container.scrollTop;
        this.render();
    }

    render() {
        const startIndex = Math.floor(this.scrollTop / this.itemHeight);
        const endIndex = Math.min(startIndex + this.visibleItems, this.items.length);
        
        this.visibleContainer.innerHTML = '';
        this.visibleContainer.style.transform = `translateY(${startIndex * this.itemHeight}px)`;
        
        for (let i = startIndex; i < endIndex; i++) {
            const item = this.renderItem(this.items[i], i);
            this.visibleContainer.appendChild(item);
        }
    }

    updateItems(newItems) {
        this.items = newItems;
        this.totalHeight = this.items.length * this.itemHeight;
        this.spacer.style.height = `${this.totalHeight}px`;
        this.render();
    }
}

/**
 * Web Workers para processamento pesado
 */
export function createWorker(workerFunction) {
    const blob = new Blob([`(${workerFunction.toString()})()`], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
}

/**
 * IndexedDB para cache local
 */
export class LocalCache {
    constructor(dbName = 'appCache', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('cache')) {
                    const store = db.createObjectStore('cache', { keyPath: 'key' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    async set(key, value, ttl = 3600000) { // TTL padrão: 1 hora
        if (!this.db) await this.init();
        
        const transaction = this.db.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        
        await store.put({
            key,
            value,
            timestamp: Date.now(),
            ttl
        });
    }

    async get(key) {
        if (!this.db) await this.init();
        
        const transaction = this.db.transaction(['cache'], 'readonly');
        const store = transaction.objectStore('cache');
        const result = await store.get(key);
        
        if (!result) return null;
        
        // Verifica se expirou
        if (Date.now() - result.timestamp > result.ttl) {
            this.delete(key);
            return null;
        }
        
        return result.value;
    }

    async delete(key) {
        if (!this.db) await this.init();
        
        const transaction = this.db.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        await store.delete(key);
    }

    async clear() {
        if (!this.db) await this.init();
        
        const transaction = this.db.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        await store.clear();
    }
}

/**
 * Otimizações de inicialização
 */
export function initializePerformanceOptimizations() {
    // Lazy loading de imagens
    initializeLazyLoading();
    
    // Preload de recursos críticos
    preloadCriticalResources();
    
    // Otimização de eventos de scroll/resize
    const optimizedScroll = throttle(() => {
        // Lógica para scroll otimizado
        domCache.clear(); // Limpa cache quando há mudanças de layout
    }, 100);
    
    const optimizedResize = debounce(() => {
        // Lógica para resize otimizado
        domCache.clear();
    }, 250);
    
    window.addEventListener('scroll', optimizedScroll, { passive: true });
    window.addEventListener('resize', optimizedResize, { passive: true });
    
    // Prefetch de páginas
    const prefetchLinks = document.querySelectorAll('[data-prefetch]');
    prefetchLinks.forEach(link => {
        link.addEventListener('mouseenter', () => {
            const prefetchLink = document.createElement('link');
            prefetchLink.rel = 'prefetch';
            prefetchLink.href = link.dataset.prefetch;
            document.head.appendChild(prefetchLink);
        }, { once: true });
    });
}

/**
 * Monitor de performance
 */
export class PerformanceMonitor {
    constructor() {
        this.metrics = {};
        this.observers = [];
    }

    startMeasure(name) {
        performance.mark(`${name}-start`);
    }

    endMeasure(name) {
        performance.mark(`${name}-end`);
        performance.measure(name, `${name}-start`, `${name}-end`);
        
        const measure = performance.getEntriesByName(name)[0];
        this.metrics[name] = measure.duration;
        
        // Log performance issues
        if (measure.duration > 100) {
            console.warn(`Performance issue detected: ${name} took ${measure.duration.toFixed(2)}ms`);
        }
        
        return measure.duration;
    }

    observePageLoad() {
        if ('PerformanceObserver' in window) {
            const shouldLogResources = () => {
                const debugFlag = window.__DEBUG__;
                if (!debugFlag) return false;
                if (typeof debugFlag === 'boolean') return debugFlag;
                if (typeof debugFlag === 'object') {
                    return Boolean(debugFlag.performance || debugFlag.all || debugFlag.resources);
                }
                return false;
            };
            const observer = new PerformanceObserver((list) => {
                if (!shouldLogResources()) return;
                for (const entry of list.getEntries()) {
                    const safeName = sanitizeResourceName(entry.name);
                    console.log(`[PerformanceMonitor] Resource loaded: ${safeName} - ${entry.duration.toFixed(2)}ms`);
                }
            });
            
            observer.observe({ entryTypes: ['resource'] });
            this.observers.push(observer);
        }
    }

    getMetrics() {
        return {
            ...this.metrics,
            navigation: performance.getEntriesByType('navigation')[0],
            paint: performance.getEntriesByType('paint')
        };
    }

    generateReport() {
        const metrics = this.getMetrics();
        const report = {
            timestamp: new Date().toISOString(),
            pageLoad: metrics.navigation ? metrics.navigation.loadEventEnd - metrics.navigation.navigationStart : 0,
            firstContentfulPaint: metrics.paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0,
            customMetrics: { ...this.metrics }
        };
        
        console.table(report);
        return report;
    }

    disconnect() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
    }
}

// Instância global do monitor
export const performanceMonitor = new PerformanceMonitor();

// Cache local global
export const localCache = new LocalCache();
