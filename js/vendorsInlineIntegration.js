import { getAllVendors } from './firestoreService.js';

(function () {
  const state = {
    vendors: [],
    loading: false,
  };

  const suggest = {
    activeContext: null,
    activeType: null,
    items: [],
    highlightIndex: -1,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function norm(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normKey(value) {
    return norm(value).toLowerCase();
  }

  function isModalOpen(modalId) {
    const modal = byId(modalId);
    return Boolean(modal && (modal.style.display === 'block' || modal.classList.contains('show')));
  }

  function isDetailsModalOpen() {
    return isModalOpen('details-modal');
  }

  function sortByName(items, getter) {
    return [...items].sort((a, b) => {
      const av = norm(getter(a));
      const bv = norm(getter(b));
      return av.localeCompare(bv, 'pt-BR', { sensitivity: 'base' });
    });
  }

  function findVendorByName(vendorName) {
    const target = normKey(vendorName);
    if (!target) return null;
    return state.vendors.find((vendor) => normKey(vendor?.name) === target) || null;
  }

  function findEmpreendimentoByName(vendor, empreendimentoName) {
    if (!vendor) return null;
    const target = normKey(empreendimentoName);
    if (!target) return null;
    return (vendor.empreendimentos || []).find((emp) => normKey(emp?.nome || emp?.name) === target) || null;
  }

  function getEmpreendimentoDefaults(emp = {}) {
    return {
      cartorioPadrao: norm(emp.cartorioPadrao || emp.cartorio || emp.cartorioRegistroPadrao),
      agenciaPadrao: norm(emp.agenciaPadrao || emp.agencia || emp.agenciaCefPadrao),
      codigoCCAPadrao: norm(emp.codigoCCAPadrao || emp.codigoCCA || emp.ccaCodigo).toUpperCase(),
    };
  }

  function clearAutoFilledDetailsFields() {
    ['modal-cartorio', 'modal-agencia', 'modal-codigoCCA'].forEach((fieldId) => {
      const input = byId(fieldId);
      if (!input) return;

      if (input.dataset.autoFilledByEmpreendimento === 'true') {
        const hadValue = input.value !== '';
        input.value = '';
        delete input.dataset.autoFilledByEmpreendimento;
        input.dataset.userModified = 'true';
        if (hadValue) {
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
  }

  function bindDetailsDefaultManualOverrideWatchers() {
    ['modal-cartorio', 'modal-agencia', 'modal-codigoCCA'].forEach((fieldId) => {
      const input = byId(fieldId);
      if (!input || input.__empDefaultWatcherBound) return;

      const markManualOverride = (event) => {
        if (!event.isTrusted) return;
        delete input.dataset.autoFilledByEmpreendimento;
      };

      input.addEventListener('input', markManualOverride);
      input.addEventListener('change', markManualOverride);
      input.__empDefaultWatcherBound = true;
    });
  }

  function applyEmpreendimentoDefaultsToDetails(options = {}) {
    const { respectExisting = true } = options;
    if (!isDetailsModalOpen()) return;

    const vendorInput = byId('modal-vendedorConstrutora');
    const empreendimentoInput = byId('modal-empreendimento');
    if (!vendorInput || !empreendimentoInput) return;

    const vendorName = norm(vendorInput.value);
    const empreendimentoName = norm(empreendimentoInput.value);
    if (!vendorName || !empreendimentoName) return;

    const vendor = findVendorByName(vendorName);
    if (!vendor) return;

    const empreendimento = findEmpreendimentoByName(vendor, empreendimentoName);
    if (!empreendimento) return;

    const defaults = getEmpreendimentoDefaults(empreendimento);
    const assignments = [
      { input: byId('modal-cartorio'), value: defaults.cartorioPadrao },
      { input: byId('modal-agencia'), value: defaults.agenciaPadrao },
      { input: byId('modal-codigoCCA'), value: defaults.codigoCCAPadrao },
    ];

    assignments.forEach(({ input, value }) => {
      if (!input || !value) return;
      const currentValue = norm(input.value);
      if (respectExisting && currentValue) return;

      input.value = value;
      input.dataset.userModified = 'true';
      input.dataset.autoFilledByEmpreendimento = 'true';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function populateVendorDatalist() {
    const datalist = byId('datalist-vendedores');
    if (!datalist) return;

    const vendorNames = sortByName(
      state.vendors.filter((vendor) => vendor?.active !== false),
      (vendor) => vendor?.name
    ).map((vendor) => norm(vendor.name)).filter(Boolean);

    datalist.innerHTML = vendorNames.map((name) => `<option value="${name}"></option>`).join('');
  }

  function updateEmpreendimentosDatalist(vendorName) {
    const datalist = byId('datalist-empreendimentos');
    if (!datalist) return;

    const vendor = findVendorByName(vendorName);
    if (!vendor) {
      datalist.innerHTML = '';
      return;
    }

    const empreendimentos = sortByName(
      Array.isArray(vendor.empreendimentos) ? vendor.empreendimentos : [],
      (emp) => emp?.nome || emp?.name
    )
      .map((emp) => norm(emp?.nome || emp?.name))
      .filter(Boolean);

    datalist.innerHTML = empreendimentos.map((name) => `<option value="${name}"></option>`).join('');
  }

  function refreshDatalistsFromVisibleContext() {
    const detailsVendor = byId('modal-vendedorConstrutora');
    const addVendor = byId('add-vendedorConstrutora');

    if (isDetailsModalOpen() && detailsVendor) {
      updateEmpreendimentosDatalist(detailsVendor.value);
      return;
    }

    if (addVendor) {
      updateEmpreendimentosDatalist(addVendor.value);
    }
  }

  function getContextFields(context) {
    const isDetails = context === 'details';

    return {
      context,
      vendorInput: byId(isDetails ? 'modal-vendedorConstrutora' : 'add-vendedorConstrutora'),
      empreendimentoInput: byId(isDetails ? 'modal-empreendimento' : 'add-empreendimento'),
      vendorPanel: byId(isDetails ? 'suggestions-modal-vendors' : 'suggestions-vendors'),
      vendorList: byId(isDetails ? 'suggestions-modal-vendors-list' : 'suggestions-vendors-list'),
      empreendimentoPanel: byId(isDetails ? 'suggestions-modal-emps' : 'suggestions-emps'),
      empreendimentoList: byId(isDetails ? 'suggestions-modal-emps-list' : 'suggestions-emps-list'),
    };
  }

  function hidePanel(panelEl) {
    if (!panelEl) return;
    panelEl.hidden = true;
  }

  function hideAllPanels() {
    ['suggestions-vendors', 'suggestions-emps', 'suggestions-modal-vendors', 'suggestions-modal-emps']
      .forEach((panelId) => hidePanel(byId(panelId)));

    suggest.activeContext = null;
    suggest.activeType = null;
    suggest.items = [];
    suggest.highlightIndex = -1;
  }

  function renderSuggestions(listEl, items, options = {}) {
    if (!listEl) return;

    const { emptyText = 'Sem resultados' } = options;
    listEl.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = emptyText;
      listEl.appendChild(empty);
      return;
    }

    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'sg-item';
      li.dataset.index = String(index);
      if (index === suggest.highlightIndex) {
        li.classList.add('active');
      }

      const label = document.createElement('span');
      label.textContent = item.label;
      li.appendChild(label);

      if (item.meta) {
        const meta = document.createElement('span');
        meta.className = 'sg-meta';
        meta.textContent = item.meta;
        li.appendChild(meta);
      }

      listEl.appendChild(li);
    });
  }

  function showPanel(context, type, items, options = {}) {
    const fields = getContextFields(context);
    const panel = type === 'vendors' ? fields.vendorPanel : fields.empreendimentoPanel;
    const list = type === 'vendors' ? fields.vendorList : fields.empreendimentoList;

    if (!panel || !list) return;

    renderSuggestions(list, items, options);
    panel.hidden = false;

    suggest.activeContext = context;
    suggest.activeType = type;
    suggest.items = items;
    if (!items.length) {
      suggest.highlightIndex = -1;
    }
  }

  function rebuildActivePanel() {
    if (!suggest.activeContext || !suggest.activeType) return;

    if (suggest.activeType === 'vendors') {
      showVendorSuggestions(suggest.activeContext);
      return;
    }

    showEmpreendimentoSuggestions(suggest.activeContext);
  }

  function buildVendorItems(query) {
    return sortByName(
      state.vendors.filter((vendor) => vendor?.active !== false),
      (vendor) => vendor?.name
    )
      .map((vendor) => ({
        value: norm(vendor.name),
        label: norm(vendor.name),
        meta: String((vendor.empreendimentos || []).length),
      }))
      .filter((item) => item.value)
      .filter((item) => !query || normKey(item.value).includes(query));
  }

  function buildEmpreendimentoItems(vendorName, query) {
    const vendor = findVendorByName(vendorName);
    if (!vendor) return [];

    return sortByName(
      Array.isArray(vendor.empreendimentos) ? vendor.empreendimentos : [],
      (emp) => emp?.nome || emp?.name
    )
      .map((emp) => {
        const value = norm(emp?.nome || emp?.name);
        return {
          value,
          label: value,
          meta: `${(emp?.blocos || []).length} blocos`,
        };
      })
      .filter((item) => item.value)
      .filter((item) => !query || normKey(item.value).includes(query));
  }

  function showVendorSuggestions(context) {
    const fields = getContextFields(context);
    if (!fields.vendorInput || !fields.vendorPanel || !fields.vendorList) return;

    const query = normKey(fields.vendorInput.value);
    const items = buildVendorItems(query);

    showPanel(context, 'vendors', items, {
      emptyText: 'Sem construtoras',
    });
  }

  function showEmpreendimentoSuggestions(context) {
    const fields = getContextFields(context);
    if (!fields.vendorInput || !fields.empreendimentoPanel || !fields.empreendimentoList) return;

    const vendorName = norm(fields.vendorInput.value);
    if (!vendorName) {
      showPanel(context, 'emps', [], {
        emptyText: 'Selecione um vendedor primeiro',
      });
      return;
    }

    const query = normKey(fields.empreendimentoInput?.value || '');
    const items = buildEmpreendimentoItems(vendorName, query);

    showPanel(context, 'emps', items, {
      emptyText: 'Sem empreendimentos cadastrados',
    });
  }

  function markDetailsFieldAsModified(input) {
    if (!input) return;
    input.dataset.userModified = 'true';
  }

  function selectVendorFromSuggestions(context, item) {
    const fields = getContextFields(context);
    if (!fields.vendorInput || !fields.empreendimentoInput) return;

    fields.vendorInput.value = item.value;
    fields.vendorInput.dataset.preferredValue = item.value;

    fields.empreendimentoInput.value = '';
    delete fields.empreendimentoInput.dataset.preferredValue;

    if (context === 'details') {
      clearAutoFilledDetailsFields();
      markDetailsFieldAsModified(fields.vendorInput);
      markDetailsFieldAsModified(fields.empreendimentoInput);
    }

    updateEmpreendimentosDatalist(item.value);

    fields.vendorInput.dispatchEvent(new Event('input', { bubbles: true }));
    fields.vendorInput.dispatchEvent(new Event('change', { bubbles: true }));

    hideAllPanels();
    fields.empreendimentoInput.focus();
  }

  function selectEmpreendimentoFromSuggestions(context, item) {
    const fields = getContextFields(context);
    if (!fields.empreendimentoInput) return;

    fields.empreendimentoInput.value = item.value;
    fields.empreendimentoInput.dataset.preferredValue = item.value;

    if (context === 'details') {
      clearAutoFilledDetailsFields();
      markDetailsFieldAsModified(fields.empreendimentoInput);
      applyEmpreendimentoDefaultsToDetails({ respectExisting: false });
    }

    fields.empreendimentoInput.dispatchEvent(new Event('input', { bubbles: true }));
    fields.empreendimentoInput.dispatchEvent(new Event('change', { bubbles: true }));

    hideAllPanels();

    const blocoField = byId(context === 'details' ? 'modal-bloco' : 'add-bloco');
    if (blocoField) {
      blocoField.focus();
    }
  }

  function handleSuggestionClick(event, context, type) {
    const itemEl = event.target.closest('.sg-item');
    if (!itemEl) return;

    const index = Number(itemEl.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= suggest.items.length) return;

    const item = suggest.items[index];
    if (!item) return;

    if (type === 'vendors') {
      selectVendorFromSuggestions(context, item);
      return;
    }

    selectEmpreendimentoFromSuggestions(context, item);
  }

  function updateHighlight(listEl) {
    if (!listEl) return;
    const items = Array.from(listEl.querySelectorAll('.sg-item'));
    items.forEach((item, index) => {
      item.classList.toggle('active', index === suggest.highlightIndex);
    });

    const highlighted = items[suggest.highlightIndex];
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  }

  function handleKeyNavigation(event, context, type) {
    if (suggest.activeContext !== context || suggest.activeType !== type) return;

    if (!suggest.items.length) {
      if (event.key === 'Escape' || event.key === 'Tab') {
        hideAllPanels();
      }
      return;
    }

    const fields = getContextFields(context);
    const listEl = type === 'vendors' ? fields.vendorList : fields.empreendimentoList;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      suggest.highlightIndex = (suggest.highlightIndex + 1) % suggest.items.length;
      updateHighlight(listEl);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      suggest.highlightIndex = (suggest.highlightIndex - 1 + suggest.items.length) % suggest.items.length;
      updateHighlight(listEl);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (suggest.highlightIndex < 0 || suggest.highlightIndex >= suggest.items.length) return;

      const item = suggest.items[suggest.highlightIndex];
      if (type === 'vendors') {
        selectVendorFromSuggestions(context, item);
      } else {
        selectEmpreendimentoFromSuggestions(context, item);
      }
      return;
    }

    if (event.key === 'Escape' || event.key === 'Tab') {
      hideAllPanels();
    }
  }

  function handleVendorInput(context, event) {
    const fields = getContextFields(context);
    if (!fields.vendorInput || !fields.empreendimentoInput) return;

    updateEmpreendimentosDatalist(fields.vendorInput.value);

    if (event?.isTrusted) {
      fields.empreendimentoInput.value = '';
      delete fields.empreendimentoInput.dataset.preferredValue;

      if (context === 'details') {
        clearAutoFilledDetailsFields();
      }
    }

    showVendorSuggestions(context);
  }

  function handleVendorChange(context, event) {
    const fields = getContextFields(context);
    if (!fields.vendorInput || !fields.empreendimentoInput) return;

    updateEmpreendimentosDatalist(fields.vendorInput.value);

    if (event?.isTrusted) {
      fields.empreendimentoInput.value = '';
      delete fields.empreendimentoInput.dataset.preferredValue;

      if (context === 'details') {
        clearAutoFilledDetailsFields();
      }
    }

    hidePanel(fields.vendorPanel);
  }

  function handleEmpreendimentoInput(context) {
    showEmpreendimentoSuggestions(context);
  }

  function handleEmpreendimentoChange(context, event) {
    if (context === 'details' && event?.isTrusted) {
      clearAutoFilledDetailsFields();
      applyEmpreendimentoDefaultsToDetails({ respectExisting: false });
    }

    const fields = getContextFields(context);
    hidePanel(fields.empreendimentoPanel);
  }

  function bindContextEvents(context) {
    const fields = getContextFields(context);
    if (!fields.vendorInput || !fields.empreendimentoInput) return;

    if (!fields.vendorInput.__vendorsSuggestBound) {
      fields.vendorInput.addEventListener('input', (event) => handleVendorInput(context, event));
      fields.vendorInput.addEventListener('change', (event) => handleVendorChange(context, event));
      fields.vendorInput.addEventListener('focus', () => showVendorSuggestions(context));
      fields.vendorInput.addEventListener('keydown', (event) => handleKeyNavigation(event, context, 'vendors'));
      fields.vendorInput.__vendorsSuggestBound = true;
    }

    if (!fields.empreendimentoInput.__vendorsSuggestBound) {
      fields.empreendimentoInput.addEventListener('input', () => handleEmpreendimentoInput(context));
      fields.empreendimentoInput.addEventListener('change', (event) => handleEmpreendimentoChange(context, event));
      fields.empreendimentoInput.addEventListener('focus', () => showEmpreendimentoSuggestions(context));
      fields.empreendimentoInput.addEventListener('keydown', (event) => handleKeyNavigation(event, context, 'emps'));
      fields.empreendimentoInput.__vendorsSuggestBound = true;
    }

    if (fields.vendorList && !fields.vendorList.__vendorsSuggestBound) {
      fields.vendorList.addEventListener('click', (event) => handleSuggestionClick(event, context, 'vendors'));
      fields.vendorList.__vendorsSuggestBound = true;
    }

    if (fields.empreendimentoList && !fields.empreendimentoList.__vendorsSuggestBound) {
      fields.empreendimentoList.addEventListener('click', (event) => handleSuggestionClick(event, context, 'emps'));
      fields.empreendimentoList.__vendorsSuggestBound = true;
    }
  }

  function hideLegacyExplorer() {
    const explorer = byId('vendors-explorer');
    const toggle = byId('toggle-vendors-explorer-btn');

    if (explorer) {
      explorer.style.display = 'none';
    }

    if (toggle) {
      toggle.style.display = 'none';
    }
  }

  function refreshFields() {
    populateVendorDatalist();
    refreshDatalistsFromVisibleContext();
    bindContextEvents('add');
    bindContextEvents('details');
    bindDetailsDefaultManualOverrideWatchers();
    applyEmpreendimentoDefaultsToDetails({ respectExisting: true });
    rebuildActivePanel();
  }

  async function loadVendors(force = false) {
    if (state.loading) return;
    state.loading = true;

    try {
      state.vendors = await getAllVendors({ forceRefresh: force });
      refreshFields();

      if (window.__DEBUG__) {
        console.debug('[vendorsInline] Vendors carregados:', state.vendors.length, 'force:', force);
      }
    } catch (error) {
      console.warn('[vendorsInline] Falha ao carregar vendors:', error);
    } finally {
      state.loading = false;
    }
  }

  function bindGlobalHandlers() {
    if (!document.__vendorsSuggestGlobalBound) {
      document.addEventListener('click', (event) => {
        if (!event.target.closest('.inline-suggest-wrapper')) {
          hideAllPanels();
        }
      });
      document.__vendorsSuggestGlobalBound = true;
    }
  }

  function bindModalObserver(modalId, onOpen) {
    const modal = byId(modalId);
    if (!modal) return;

    const observer = new MutationObserver(() => {
      if (!isModalOpen(modalId)) return;
      onOpen();
    });

    observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  function initObservers() {
    bindModalObserver('add-contract-modal', () => {
      hideLegacyExplorer();
      bindContextEvents('add');
      refreshDatalistsFromVisibleContext();
      loadVendors();
    });

    bindModalObserver('details-modal', () => {
      bindContextEvents('details');
      bindDetailsDefaultManualOverrideWatchers();
      refreshDatalistsFromVisibleContext();
      applyEmpreendimentoDefaultsToDetails({ respectExisting: true });
      loadVendors();
    });
  }

  function primeOnFocus() {
    ['add-vendedorConstrutora', 'add-empreendimento', 'modal-vendedorConstrutora', 'modal-empreendimento']
      .forEach((fieldId) => {
        const input = byId(fieldId);
        if (!input || input.__vendorsPrimeBound) return;

        input.addEventListener('focus', () => {
          if (!state.vendors.length && !state.loading) {
            loadVendors();
          }
        });

        input.__vendorsPrimeBound = true;
      });
  }

  function boot() {
    hideLegacyExplorer();
    bindGlobalHandlers();
    bindContextEvents('add');
    bindContextEvents('details');
    bindDetailsDefaultManualOverrideWatchers();
    initObservers();
    primeOnFocus();
    refreshFields();

    if (!window.__VENDORS_INLINE__) {
      window.__VENDORS_INLINE__ = {
        reload: () => loadVendors(true),
        refreshSelects: () => refreshFields(),
        refreshFields: () => refreshFields(),
        state,
      };
    } else {
      window.__VENDORS_INLINE__.reload = () => loadVendors(true);
      window.__VENDORS_INLINE__.refreshSelects = () => refreshFields();
      window.__VENDORS_INLINE__.refreshFields = () => refreshFields();
      window.__VENDORS_INLINE__.state = state;
    }

    if (window.__DEBUG__) {
      console.debug('[vendorsInline] Inicializado');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
