import { auth } from "./auth.js";
import { redirectToLogin } from "./authRedirect.js";

const INACTIVITY_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
const CHECK_INTERVAL = 60 * 1000; // Check every 1 minute
const STORAGE_KEY = 'lastActivityTime';

export const InactivityService = {
  init() {
    // Only initialize if the user is authenticated (handled by caller, but good check)
    if (!auth.currentUser) return;

    console.log(' Monitor de inatividade iniciado (Timeout: 12h)');
    
    this.updateLastActivity();
    this.startActivityListeners();
    this.startInactivityCheck();
  },

  updateLastActivity() {
    const now = Date.now();
    localStorage.setItem(STORAGE_KEY, now.toString());
  },

  getLastActivity() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored) : Date.now();
  },

  startActivityListeners() {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    
    // Throttle the update to avoid excessive writes to localStorage
    let throttleTimer;
    const throttledUpdate = () => {
      if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
          this.updateLastActivity();
          throttleTimer = null;
        }, 30 * 1000); // Update max once every 30 seconds
      }
    };

    events.forEach(event => {
      window.addEventListener(event, throttledUpdate, { passive: true });
    });
  },

  startInactivityCheck() {
    // Check immediately on load
    this.checkInactivity();

    // Then check periodically
    setInterval(() => {
      this.checkInactivity();
    }, CHECK_INTERVAL);
  },

  checkInactivity() {
    const lastActivity = this.getLastActivity();
    const now = Date.now();
    
    if (now - lastActivity > INACTIVITY_TIMEOUT) {
      this.logout();
    }
  },

  async logout() {
    console.warn(' Sessão expirada por inatividade (12h). Deslogando...');
    
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Erro ao deslogar por inatividade:', error);
    } finally {
      // Force redirect and clear storage
      localStorage.removeItem(STORAGE_KEY);
      redirectToLogin({ reason: 'inactivity' });
    }
  }
};
