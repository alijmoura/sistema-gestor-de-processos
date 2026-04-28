const AGENDA_SCRIPT_PATHS = [
  'js/scheduleTypesService.js',
  'js/bookingLinkService.js',
  'js/eventsDataModel.js',
  'js/localCalendarService.js',
  'js/agendaUI.js'
];

let agendaLoadingPromise = null;

function ensureNotificationFallback() {
  if (typeof window.showNotification === 'function') {
    return;
  }

  window.showNotification = (message, type = 'info') => {
    const notification = document.getElementById('notification');
    if (!notification) {
      console.log(`[Agenda] ${message}`);
      return;
    }

    notification.textContent = message;
    notification.className = `notification show ${type}`;
    setTimeout(() => {
      notification.classList.remove('show');
    }, 3200);
  };
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const alreadyLoaded = Array.from(document.scripts)
      .some((script) => script.src && script.src.includes(src));
    if (alreadyLoaded) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.dataset.dynamicSrc = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(script);
  });
}

function bootstrapAgendaServices() {
  if (window.EventsDataService && !window.eventsDataService) {
    window.eventsDataService = new window.EventsDataService();
  }

  if (window.LocalCalendarService && !window.localCalendarService) {
    window.localCalendarService = new window.LocalCalendarService();
  }

  if (window.AgendaUI && !window.agendaUI) {
    window.agendaUI = new window.AgendaUI();
  }
}

async function loadAgendaModules() {
  if (window.__agendaLoaded) {
    return;
  }

  if (agendaLoadingPromise) {
    return agendaLoadingPromise;
  }

  agendaLoadingPromise = (async () => {
    ensureNotificationFallback();
    for (const src of AGENDA_SCRIPT_PATHS) {
      await loadScriptOnce(src);
    }
    bootstrapAgendaServices();
    window.__agendaLoaded = true;
  })().catch((error) => {
    window.__agendaLoaded = false;
    throw error;
  }).finally(() => {
    agendaLoadingPromise = null;
  });

  return agendaLoadingPromise;
}

export default {
  async initialize() {
    await loadAgendaModules();
  },
  async refresh() {
    if (window.agendaUI?.loadEvents) {
      await window.agendaUI.loadEvents();
      if (window.agendaUI.renderCalendar) {
        window.agendaUI.renderCalendar();
      }
    }
  },
  async dispose() {
    return undefined;
  }
};
