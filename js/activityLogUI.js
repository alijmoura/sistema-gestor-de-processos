import { activityLogService } from './activityLogService.js';
import { auth } from './auth.js';

export const activityLogUI = {
  containerId: 'activity-feed-list',

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  async init() {
    const refreshBtn = document.getElementById('btn-refresh-feed');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadActivities());
    }

    await this.loadActivities();
  },

  async resolveFeedQueryOptions() {
    await activityLogService.waitForCurrentUserContext(5000);

    const isAdmin = await activityLogService.isCurrentUserAdmin();
    if (isAdmin) {
      return { limit: 10, enrich: false };
    }

    const userUid = auth?.currentUser?.uid || window.appState?.currentUserProfile?.uid || null;
    return {
      limit: 10,
      enrich: false,
      userUid: userUid || '__missing_uid__'
    };
  },

  async loadActivities() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="text-center text-muted py-4">
        <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
        Carregando atividades...
      </div>
    `;

    try {
      const queryOptions = await this.resolveFeedQueryOptions();
      const activities = await activityLogService.getRecentActivities(queryOptions);
      this.renderActivities(activities);
    } catch (error) {
      console.error('[activityLogUI] Erro ao carregar atividades recentes:', error);
      container.innerHTML = `
        <div class="text-center text-danger py-4">
          <i class="bi bi-exclamation-triangle me-2"></i>Erro ao carregar atividades.
        </div>
      `;
    }
  },

  buildExtraHtml(activity) {
    const rows = activityLogService.buildActivityDetailRows(activity);
    if (!rows.length) return '';

    return rows.map((row) => (
      `<div class="mt-1 text-muted small">${this.escapeHtml(row.label)}: <strong>${this.escapeHtml(row.value)}</strong></div>`
    )).join('');
  },

  renderActivities(activities) {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    if (!activities || activities.length === 0) {
      container.innerHTML = `
        <div class="text-center text-muted py-4">
          <i class="bi bi-info-circle me-2"></i>Nenhuma atividade recente encontrada.
        </div>
      `;
      return;
    }

    container.innerHTML = '';

    activities.forEach((activity) => {
      const item = document.createElement('div');
      item.className = 'list-group-item px-3 py-3 border-bottom';

      const iconData = this.getIconForActivity(activity.actionType);
      const timestamp = activity.timestamp instanceof Date
        ? activity.timestamp
        : new Date(activity.timestamp);
      const timeAgo = this.formatTimeAgo(timestamp);
      const description = activityLogService.formatActivityDescription(activity);
      const extraHtml = this.buildExtraHtml(activity);
      const userName = activity.userDisplayName || activity.actorName || activity.userName || 'Sistema';
      const timestampTitle = timestamp instanceof Date && !Number.isNaN(timestamp.getTime())
        ? timestamp.toLocaleString('pt-BR')
        : '';

      item.innerHTML = `
        <div class="d-flex w-100 justify-content-between align-items-start">
          <div class="d-flex align-items-start gap-3">
            <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width: 40px; height: 40px; background-color: ${iconData.bg}; color: ${iconData.color};">
              <i class="bi ${iconData.icon} fs-5"></i>
            </div>
            <div>
              <p class="mb-1 fw-medium text-dark">${this.escapeHtml(description)}</p>
              <p class="mb-0 text-secondary small">
                <i class="bi bi-person me-1"></i>${this.escapeHtml(userName)}
              </p>
              ${extraHtml}
            </div>
          </div>
          <small class="text-muted text-nowrap ms-2" title="${this.escapeHtml(timestampTitle)}">
            ${timeAgo}
          </small>
        </div>
      `;

      container.appendChild(item);
    });
  },

  getIconForActivity(type) {
    switch (type) {
      case 'STATUS_CHANGE':
      case 'BULK_STATUS_CHANGE':
        return { icon: 'bi-arrow-left-right', bg: 'rgba(13, 110, 253, 0.1)', color: '#0d6efd' };
      case 'NEW_APPROVAL':
        return { icon: 'bi-clipboard-plus', bg: 'rgba(25, 135, 84, 0.1)', color: '#198754' };
      case 'APPROVAL_DELETED':
        return { icon: 'bi-clipboard-x', bg: 'rgba(220, 53, 69, 0.1)', color: '#dc3545' };
      case 'CSV_IMPORT':
        return { icon: 'bi-file-earmark-arrow-up', bg: 'rgba(13, 202, 240, 0.1)', color: '#0dcaf0' };
      case 'EXPORT_REPORT':
      case 'WHATSAPP_CHAT_EXPORTED':
        return { icon: 'bi-file-earmark-arrow-down', bg: 'rgba(108, 117, 125, 0.1)', color: '#6c757d' };
      case 'WHATSAPP_MSG':
      case 'WHATSAPP_CHAT_ASSIGNED':
      case 'WHATSAPP_CHAT_TRANSFERRED':
      case 'WHATSAPP_CHAT_RESOLVED':
      case 'WHATSAPP_CHAT_REOPENED':
        return { icon: 'bi-whatsapp', bg: 'rgba(32, 201, 151, 0.1)', color: '#20c997' };
      case 'CONTRACT_ADDED':
        return { icon: 'bi-file-earmark-plus', bg: 'rgba(13, 202, 240, 0.1)', color: '#0dcaf0' };
      case 'CONTRACT_DELETED':
        return { icon: 'bi-file-earmark-x', bg: 'rgba(220, 53, 69, 0.1)', color: '#dc3545' };
      case 'CONTRACT_ARCHIVED':
        return { icon: 'bi-archive', bg: 'rgba(253, 126, 20, 0.1)', color: '#fd7e14' };
      default:
        return { icon: 'bi-activity', bg: 'rgba(108, 117, 125, 0.1)', color: '#6c757d' };
    }
  },

  formatTimeAgo(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return `${Math.floor(interval)} anos atras`;
    interval = seconds / 2592000;
    if (interval > 1) return `${Math.floor(interval)} meses atras`;
    interval = seconds / 86400;
    if (interval > 1) return `${Math.floor(interval)} d atras`;
    interval = seconds / 3600;
    if (interval > 1) return `${Math.floor(interval)} h atras`;
    interval = seconds / 60;
    if (interval > 1) return `${Math.floor(interval)} min atras`;
    return `${Math.max(seconds, 0)} s atras`;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('activity-feed-list')) {
    activityLogUI.init();
  }
});

window.activityLogUI = activityLogUI;
