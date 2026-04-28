// profile.js - Página dedicada de perfil (extraído / expandido) - 2025-09-20
// Reutiliza serviços existentes (firestoreService, Firebase Auth) sem quebrar index.html
// Mantém compatibilidade: nenhuma função global renomeada. Fornece melhorias: avatar, claims, preferências locais.

import { auth, db } from './auth.js';
import { firestoreService } from './firestoreService.js';
import { redirectToLogin } from './authRedirect.js';
import workflowService from './workflowService.js';
import userPermissionService from './userPermissionService.js';

let whatsappService = null;
import('./whatsappService.js').then((module) => {
  whatsappService = module.default;
}).catch((error) => {
  console.warn('[profile] WhatsApp service indisponivel:', error);
});

const state = {
  user: null,
  profile: null,
  avatarFile: null,
  avatarRemoved: false,
  claims: null,
  saving: false,
  isEditMode: false,
  whatsappAgent: null,
  passwordPolicy: null,
  forceRotation: new URLSearchParams(window.location.search).get('forcePasswordRotation') === '1'
};

// Elementos
const els = {
  liveRegion: document.getElementById('profile-live-region'),
  displayName: document.getElementById('profile-display-name'),
  displayEmail: document.getElementById('profile-display-email'),
  claimsBadges: document.getElementById('profile-claims-badges'),
  email: document.getElementById('profile-email'),
  fullName: document.getElementById('profile-fullname'),
  shortName: document.getElementById('profile-shortname'),
  cpf: document.getElementById('profile-cpf'),
  form: document.getElementById('profile-form'),
  profileSaveBtn: document.getElementById('profile-save-btn'),
  saveStatus: document.getElementById('profile-save-status'),
  personalViewMode: document.getElementById('personal-view-mode'),
  personalEditMode: document.getElementById('personal-edit-mode'),
  toggleEditPersonal: document.getElementById('toggle-edit-personal'),
  cancelEditPersonal: document.getElementById('cancel-edit-personal'),
  viewFullname: document.getElementById('view-fullname'),
  viewShortname: document.getElementById('view-shortname'),
  viewCpf: document.getElementById('view-cpf'),
  viewEmail: document.getElementById('view-email'),
  passwordForm: document.getElementById('password-change-form'),
  newPass: document.getElementById('profile-new-password'),
  newPassConfirm: document.getElementById('profile-new-password-confirm'),
  passwordStatus: document.getElementById('password-status'),
  passwordStrengthFill: document.getElementById('password-strength-fill'),
  passwordStrengthText: document.getElementById('password-strength-text'),
  passwordMatch: document.getElementById('password-match'),
  togglePasswordVisibility: document.getElementById('toggle-password-visibility'),
  debugToggle: document.getElementById('debug-mode-toggle'),
  avatarDropzone: document.getElementById('avatar-dropzone'),
  avatarInput: document.getElementById('avatar-input'),
  avatarImg: document.getElementById('profile-avatar'),
  avatarProgress: document.getElementById('avatar-upload-progress'),
  avatarDragIndicator: document.getElementById('avatar-drag-indicator'),
  avatarChangeBtn: document.getElementById('avatar-change-btn'),
  avatarSaveBtn: document.getElementById('avatar-save-btn'),
  avatarRemoveBtn: document.getElementById('avatar-remove-btn'),
  avatarError: document.getElementById('avatar-error'),
  avatarSuccess: document.getElementById('avatar-success'),
  claims: document.getElementById('profile-claims'),
  refreshClaimsBtn: document.getElementById('refresh-claims-btn'),
  logout: document.getElementById('logout-button'),
  topbarEmail: document.getElementById('topbar-user-email') || document.getElementById('user-email'),
  sidebarRole: document.querySelector('.sidebar-user-role'),
  sidebarAvatar: document.querySelector('.sidebar-user-avatar'),
  prefDark: document.getElementById('pref-dark') || document.getElementById('pref-dark-mode'),
  prefSound: document.getElementById('pref-sound'),
  prefDesktop: document.getElementById('pref-desktop-notification'),
  prefDefaultWorkflow: document.getElementById('pref-default-workflow'),
  workflowContainer: document.getElementById('workflow-preferences-container'),
  savePrefsBtn: document.getElementById('save-preferences-btn'),
  prefsStatus: document.getElementById('preferences-status'),
  notification: document.getElementById('notification'),
  sendResetEmailBtn: document.getElementById('send-reset-email-btn'),
  whatsappAgentForm: document.getElementById('whatsapp-agent-form'),
  whatsappAgentDepartment: document.getElementById('whatsapp-agent-department'),
  whatsappAgentRegisterStatus: document.getElementById('whatsapp-agent-register-status'),
  whatsappAgentRegisterSection: document.getElementById('whatsapp-agent-register-section'),
  whatsappAgentInfoSection: document.getElementById('whatsapp-agent-info-section'),
  whatsappAgentCurrentDepartment: document.getElementById('whatsapp-agent-current-department'),
  whatsappAgentCurrentStatus: document.getElementById('whatsapp-agent-current-status'),
  whatsappAgentActiveChats: document.getElementById('whatsapp-agent-active-chats'),
  whatsappAgentChangeDeptBtn: document.getElementById('whatsapp-agent-change-dept-btn'),
  main: document.querySelector('#page-perfil .profile-container'),
  shellMount: document.getElementById('sidebar-shell-mount')
};

function showMessage(msg, type = 'info', targetEl = els.notification) {
  if (!targetEl) return;
  targetEl.textContent = msg;
  targetEl.className = `notification show ${type}`;
  setTimeout(() => {
    targetEl.classList.remove('show');
  }, 3200);
}

function initTooltips() {
  if (!window.bootstrap?.Tooltip) return;
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
    window.bootstrap.Tooltip.getOrCreateInstance(el);
  });
}

function announceToScreenReader(message) {
  if (!els.liveRegion) return;
  els.liveRegion.textContent = message;
  setTimeout(() => {
    if (els.liveRegion) {
      els.liveRegion.textContent = '';
    }
  }, 1000);
}

function resolveDisplayName(profile = null, user = null) {
  return (
    profile?.fullName ||
    profile?.shortName ||
    user?.displayName ||
    user?.email ||
    'Usuário'
  ).trim();
}

function updateViewModeValues(profile = {}) {
  const email = state.user?.email || '-';
  if (els.viewFullname) els.viewFullname.textContent = profile.fullName || '-';
  if (els.viewShortname) els.viewShortname.textContent = profile.shortName || '-';
  if (els.viewCpf) els.viewCpf.textContent = profile.cpf || '-';
  if (els.viewEmail) els.viewEmail.textContent = email;
  if (els.displayName) els.displayName.textContent = resolveDisplayName(profile, state.user);
  if (els.displayEmail) els.displayEmail.textContent = email;
}

function populateFormFromProfile() {
  if (els.email) els.email.value = state.user?.email || '';
  if (els.fullName) els.fullName.value = state.profile?.fullName || '';
  if (els.shortName) els.shortName.value = state.profile?.shortName || '';
  if (els.cpf) els.cpf.value = state.profile?.cpf || '';
}

function toggleEditMode(isEditing) {
  state.isEditMode = Boolean(isEditing);
  els.personalViewMode?.classList.toggle('d-none', state.isEditMode);
  els.personalEditMode?.classList.toggle('d-none', !state.isEditMode);

  if (els.toggleEditPersonal) {
    els.toggleEditPersonal.setAttribute('aria-expanded', state.isEditMode.toString());
    els.toggleEditPersonal.innerHTML = state.isEditMode
      ? '<i class="bi bi-x-lg"></i>'
      : '<i class="bi bi-pencil"></i>';
    els.toggleEditPersonal.setAttribute(
      'aria-label',
      state.isEditMode ? 'Cancelar edicao' : 'Editar informacoes pessoais'
    );
  }

  if (state.isEditMode) {
    setTimeout(() => els.fullName?.focus(), 80);
  }

  announceToScreenReader(state.isEditMode ? 'Modo de edicao ativado' : 'Modo de visualizacao');
}

function guardAuth() {
  if (!auth.currentUser) {
    // Redireciona se não logado
    redirectToLogin();
    return false;
  }
  return true;
}

function applyForcedRotationUI() {
  if (!state.forceRotation) return;

  if (els.shellMount) {
    els.shellMount.classList.add('d-none');
    document.body.style.paddingLeft = '0';
  }

  if (els.main) {
    els.main.style.marginTop = '24px';
  }

  if (els.main && !document.getElementById('password-rotation-alert')) {
    const alert = document.createElement('div');
    alert.id = 'password-rotation-alert';
    alert.className = 'alert alert-warning';
    alert.innerHTML = '<strong>Sua senha expirou.</strong> Altere a senha para liberar o acesso ao sistema.';
    els.main.prepend(alert);
  }

  const profileCards = Array.from(document.querySelectorAll('.profile-card'));
  const securityCard = profileCards.find((card) =>
    Boolean(card.querySelector('#password-change-form'))
  );

  if (!securityCard) {
    console.warn('Modo de troca obrigatória: card de segurança não encontrado.');
    return;
  }

  profileCards.forEach((card) => {
    card.classList.toggle('d-none', card !== securityCard);
  });

  securityCard.classList.remove('d-none');
}

async function evaluatePasswordPolicy() {
  try {
    state.passwordPolicy = await firestoreService.getPasswordPolicyState();
    if (state.passwordPolicy) {
      state.forceRotation = state.passwordPolicy.mustChangePassword === true;
    }
  } catch (error) {
    console.warn('Falha ao avaliar política de senha', error);
  } finally {
    applyForcedRotationUI();
  }
}

async function loadProfile() {
  if (!guardAuth()) return;
  state.user = auth.currentUser;
  populateFormFromProfile();
  if (els.topbarEmail) {
    els.topbarEmail.textContent = state.user.email || '';
    els.topbarEmail.title = state.user.email || '';
  }
  try {
    state.profile = await firestoreService.getUserProfile(state.user.uid) || {};
    populateFormFromProfile();
  } catch (err) {
    console.warn('Falha ao carregar perfil', err);
    state.profile = state.profile || {};
    showMessage('Não foi possível carregar perfil.', 'error');
  }
  updateViewModeValues(state.profile || {});
  if (els.avatarImg) {
    els.avatarImg.src = state.profile?.avatarUrl || 'images/logologin.png';
  }
  els.avatarRemoveBtn?.classList.toggle('d-none', !state.profile?.avatarUrl);
  syncSidebarProfile();
  await loadClaims();
  await evaluatePasswordPolicy();
  await loadLocalPreferences();
  await loadWhatsAppAgentInfo();
  toggleEditMode(false);
}

function syncSidebarProfile() {
  const displayName = resolveDisplayName(state.profile, state.user);

  if (els.topbarEmail && displayName) {
    els.topbarEmail.textContent = displayName;
    els.topbarEmail.title = state.user?.email || displayName;
  }

  if (els.sidebarRole) {
    els.sidebarRole.textContent = displayName || 'Usuário';
  }

  if (!els.sidebarAvatar) {
    return;
  }

  const avatarUrl = (state.profile?.avatarUrl || '').trim();
  els.sidebarAvatar.innerHTML = '';

  if (!avatarUrl) {
    els.sidebarAvatar.innerHTML = '<i class="bi bi-person-circle"></i>';
    return;
  }

  const img = document.createElement('img');
  img.src = avatarUrl;
  img.alt = 'Avatar do usuario';
  img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 10px;';
  img.onerror = () => {
    els.sidebarAvatar.innerHTML = '<i class="bi bi-person-circle"></i>';
  };
  els.sidebarAvatar.appendChild(img);
}

function hideAvatarMessages() {
  els.avatarError?.classList.add('d-none');
  els.avatarSuccess?.classList.add('d-none');
}

function showAvatarError(message) {
  if (!els.avatarError) return;
  els.avatarError.textContent = message;
  els.avatarError.classList.remove('d-none');
}

function showAvatarSuccess(message) {
  if (!els.avatarSuccess) return;
  els.avatarSuccess.textContent = message;
  els.avatarSuccess.classList.remove('d-none');
}

function showAvatarProgress(percent) {
  els.avatarProgress?.classList.remove('d-none');
  const circle = els.avatarProgress?.querySelector('.circle-progress');
  const text = els.avatarProgress?.querySelector('.progress-text');
  if (circle) {
    const circumference = 2 * Math.PI * 16;
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${offset}`;
  }
  if (text) {
    text.textContent = `${Math.round(percent)}%`;
  }
}

function hideAvatarProgress() {
  els.avatarProgress?.classList.add('d-none');
}

function preventDefaults(event) {
  event.preventDefault();
  event.stopPropagation();
}

function processAvatarFile(file) {
  hideAvatarMessages();

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    showAvatarError('Formato invalido. Use JPG, PNG ou WebP.');
    return;
  }

  if (file.size > 1024 * 1024) {
    showAvatarError('Arquivo muito grande. Maximo 1MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    if (els.avatarImg) {
      els.avatarImg.src = event.target?.result || 'images/logologin.png';
    }
  };
  reader.readAsDataURL(file);

  state.avatarFile = file;
  state.avatarRemoved = false;
  els.avatarSaveBtn?.classList.remove('d-none');
  els.avatarRemoveBtn?.classList.remove('d-none');
  showAvatarSuccess('Imagem selecionada. Clique em "Salvar foto" para confirmar.');
  announceToScreenReader('Imagem de perfil selecionada');
}

function handleAvatarSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  processAvatarFile(file);
}

function handleAvatarDrop(event) {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  processAvatarFile(file);
}

function handleAvatarRemove(event) {
  event.stopPropagation();
  state.avatarFile = null;
  state.avatarRemoved = true;
  if (els.avatarInput) {
    els.avatarInput.value = '';
  }
  if (els.avatarImg) {
    els.avatarImg.src = 'images/logologin.png';
  }
  els.avatarRemoveBtn?.classList.add('d-none');
  els.avatarSaveBtn?.classList.remove('d-none');
  showAvatarSuccess('Foto removida. Clique em "Salvar foto" para confirmar.');
  announceToScreenReader('Foto de perfil removida');
}

async function handleAvatarSave(event) {
  event.stopPropagation();
  if (!guardAuth()) return;

  const saveBtn = els.avatarSaveBtn;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...';
  }

  try {
    let avatarUrl = state.profile?.avatarUrl || '';

    if (state.avatarFile) {
      const path = `users/${state.user.uid}/avatar_${Date.now()}_${state.avatarFile.name}`;
      showAvatarProgress(0);
      avatarUrl = await firestoreService.uploadUserFile(state.avatarFile, path, (progress) => {
        showAvatarProgress(progress);
      });
    }

    await db.collection('users').doc(state.user.uid).update({
      avatarUrl: state.avatarRemoved ? null : avatarUrl
    });

    state.profile = {
      ...(state.profile || {}),
      avatarUrl: state.avatarRemoved ? '' : avatarUrl
    };
    state.avatarFile = null;
    state.avatarRemoved = false;
    syncSidebarProfile();

    if (saveBtn) {
      saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvo!';
      saveBtn.classList.remove('btn-primary');
      saveBtn.classList.add('btn-success');
    }

    showMessage('Foto de perfil atualizada!', 'success');
    hideAvatarMessages();
    els.avatarRemoveBtn?.classList.toggle('d-none', !state.profile?.avatarUrl);
    announceToScreenReader('Foto de perfil atualizada');
  } catch (error) {
    console.error('Erro ao salvar avatar', error);
    showAvatarError('Erro ao salvar foto.');
    showMessage('Erro ao salvar foto.', 'error');
    if (saveBtn) {
      saveBtn.innerHTML = '<i class="bi bi-x-lg me-1"></i>Erro';
      saveBtn.classList.remove('btn-primary');
      saveBtn.classList.add('btn-danger');
    }
  } finally {
    hideAvatarProgress();
    setTimeout(() => {
      if (saveBtn) {
        saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar foto';
        saveBtn.classList.remove('btn-success', 'btn-danger');
        saveBtn.classList.add('btn-primary');
        saveBtn.classList.add('d-none');
        saveBtn.disabled = false;
      }
    }, 1500);
  }
}

function initAvatarUpload() {
  if (!els.avatarDropzone) return;

  els.avatarDropzone.addEventListener('click', () => {
    els.avatarInput?.click();
  });
  els.avatarDropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      els.avatarInput?.click();
    }
  });

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
    els.avatarDropzone.addEventListener(eventName, preventDefaults);
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    els.avatarDropzone.addEventListener(eventName, () => {
      els.avatarDropzone.classList.add('drag-over');
      els.avatarDragIndicator?.classList.remove('d-none');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    els.avatarDropzone.addEventListener(eventName, () => {
      els.avatarDropzone.classList.remove('drag-over');
      els.avatarDragIndicator?.classList.add('d-none');
    });
  });

  els.avatarInput?.addEventListener('change', handleAvatarSelect);
  els.avatarDropzone.addEventListener('drop', handleAvatarDrop);
  els.avatarChangeBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    els.avatarInput?.click();
  });
  els.avatarRemoveBtn?.addEventListener('click', handleAvatarRemove);
  els.avatarSaveBtn?.addEventListener('click', handleAvatarSave);
}

async function loadClaims(forceRefresh = false) {
  if (!guardAuth()) return;
  try {
    if (forceRefresh) {
      // Força um refresh dos tokens para claims atualizadas
      await state.user.getIdToken(true);
    }
    const tokenResult = await state.user.getIdTokenResult();
    state.claims = tokenResult.claims || {};
    renderClaims();
    updateAdminNavVisibility();
    await checkWorkflowPermissions();
  } catch (err) {
    console.warn('Erro ao obter claims', err);
    els.claims.innerHTML = '<span class="text-danger">Erro ao carregar claims</span>';
    updateAdminNavVisibility();
  }
}

function renderClaims() {
  const claims = state.claims || {};
  const keys = Object.keys(claims).filter(k => !k.startsWith('firebase')); // Filtra claims padrão

  if (els.claimsBadges) {
    els.claimsBadges.innerHTML = '';
    keys.forEach((k) => {
      const badge = document.createElement('span');
      badge.className = 'badge bg-primary';
      badge.textContent = k;
      els.claimsBadges.appendChild(badge);
    });
  }

  if (!els.claims) return;
  els.claims.innerHTML = '';
  if (keys.length === 0) {
    els.claims.innerHTML = '<span class="text-muted">Nenhuma claim personalizada</span>';
    return;
  }
  keys.forEach(k => {
    const val = claims[k];
    const span = document.createElement('span');
    span.className = 'claims-badge';
    span.textContent = `${k}:${val}`;
    els.claims.appendChild(span);
  });
}

function updateAdminNavVisibility() {
  const isAdmin = Boolean(state.claims?.admin || state.claims?.super_admin);
  document.querySelectorAll('[data-admin-only-nav="true"]').forEach((item) => {
    item.classList.toggle('d-none', !isAdmin);
  });
}

async function checkWorkflowPermissions() {
  if (!auth.currentUser || !els.workflowContainer) return;

  let isAdminOrManager = Boolean(state.claims?.admin || state.claims?.manager || state.claims?.super_admin);
  if (!isAdminOrManager) {
    try {
      const perms = await userPermissionService.getUserPermissions(auth.currentUser.uid);
      const role = String(perms?.role || '').toLowerCase();
      isAdminOrManager = role === 'admin' || role === 'manager' || role === 'super_admin';
    } catch (error) {
      console.warn('Erro ao verificar permissões de workflow:', error);
    }
  }

  els.workflowContainer.classList.toggle('d-none', !isAdminOrManager);
}

async function saveProfile(e) {
  e.preventDefault();
  if (state.saving) return;
  if (!guardAuth()) return;
  state.saving = true;
  if (els.saveStatus) els.saveStatus.textContent = 'Salvando...';
  if (els.profileSaveBtn) {
    els.profileSaveBtn.disabled = true;
    els.profileSaveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...';
  }
  const data = {
    fullName: els.fullName?.value.trim() || '',
    shortName: els.shortName?.value.trim() || '',
    cpf: els.cpf?.value.trim() || ''
  };
  try {
    // Upload avatar se houver novo arquivo
    if (state.avatarFile) {
      const avatarUrl = await uploadAvatar(state.avatarFile);
      if (avatarUrl) {
        data.avatarUrl = avatarUrl;
      }
    }
    if (state.avatarRemoved) {
      data.avatarUrl = '';
    }
    await firestoreService.updateUserProfile(data);
    if (data.avatarUrl !== undefined) {
      await db.collection('users').doc(state.user.uid).update({
        avatarUrl: data.avatarUrl || null
      });
    }
    state.profile = {
      ...(state.profile || {}),
      ...data
    };
    updateViewModeValues(state.profile);
    populateFormFromProfile();
    syncSidebarProfile();
    if (els.saveStatus) els.saveStatus.textContent = 'Perfil salvo com sucesso.';
    showMessage('Perfil atualizado.', 'success');
    state.avatarFile = null;
    state.avatarRemoved = false;
    els.avatarRemoveBtn?.classList.toggle('d-none', !state.profile?.avatarUrl);
    setTimeout(() => {
      toggleEditMode(false);
    }, 1200);
  } catch (err) {
    console.error('Erro salvar perfil', err);
    if (els.saveStatus) els.saveStatus.textContent = 'Erro ao salvar perfil.';
    showMessage('Falha ao salvar perfil.', 'error');
  } finally {
    state.saving = false;
    setTimeout(() => {
      if (els.saveStatus) els.saveStatus.textContent = '';
      if (els.profileSaveBtn) {
        els.profileSaveBtn.disabled = false;
        els.profileSaveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar';
      }
    }, 3000);
  }
}

async function uploadAvatar(file) {
  try {
    if (!file) return null;
    if (file.size > 1024 * 1024) { // 1MB
      showMessage('Arquivo muito grande (>1MB).', 'error');
      return null;
    }
    if (typeof firestoreService.uploadUserFile === 'function') {
      const path = `users/${state.user.uid}/avatar_${Date.now()}_${file.name}`;
      showAvatarProgress(0);
      const url = await firestoreService.uploadUserFile(file, path, (progress) => {
        showAvatarProgress(progress);
      });
      els.avatarImg.src = url;
      return url;
    } else {
      showMessage('Upload não suportado (função ausente).', 'error');
      return null;
    }
  } catch (err) {
    console.error('Erro upload avatar', err);
    showMessage('Erro no upload do avatar.', 'error');
    return null;
  } finally {
    hideAvatarProgress();
  }
}

function calculatePasswordStrength(password) {
  if (!password) return { level: '', text: '' };

  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 2) return { level: 'weak', text: 'Fraca' };
  if (score <= 3) return { level: 'medium', text: 'Media' };
  return { level: 'strong', text: 'Forte' };
}

function updatePasswordStrengthUI(strength) {
  if (els.passwordStrengthFill) {
    els.passwordStrengthFill.className = `password-strength-fill ${strength.level}`;
  }
  if (els.passwordStrengthText) {
    els.passwordStrengthText.textContent = strength.text ? `Forca: ${strength.text}` : '';
  }
}

function checkPasswordMatch() {
  const password = els.newPass?.value || '';
  const confirm = els.newPassConfirm?.value || '';

  if (!els.passwordMatch) return;
  if (!confirm) {
    els.passwordMatch.textContent = '';
    els.passwordMatch.className = 'form-text';
    return;
  }

  if (password === confirm) {
    els.passwordMatch.textContent = 'Senhas coincidem';
    els.passwordMatch.className = 'form-text text-success';
  } else {
    els.passwordMatch.textContent = 'Senhas nao coincidem';
    els.passwordMatch.className = 'form-text text-danger';
  }
}

function togglePasswordVisibility() {
  if (!els.newPass || !els.togglePasswordVisibility) return;
  const isVisible = els.newPass.type === 'text';
  els.newPass.type = isVisible ? 'password' : 'text';
  els.togglePasswordVisibility.setAttribute('aria-pressed', (!isVisible).toString());
  els.togglePasswordVisibility.setAttribute('aria-label', isVisible ? 'Mostrar senha' : 'Ocultar senha');
  const icon = els.togglePasswordVisibility.querySelector('i');
  if (icon) {
    icon.className = isVisible ? 'bi bi-eye' : 'bi bi-eye-slash';
  }
}

async function changePassword(e) {
  e.preventDefault();
  if (!guardAuth()) return;
  const pass = els.newPass?.value.trim() || '';
  const confirm = els.newPassConfirm?.value.trim() || '';
  if (pass.length < 6) {
    if (els.passwordStatus) els.passwordStatus.textContent = 'Senha muito curta.';
    return;
  }
  if (pass !== confirm) {
    if (els.passwordStatus) els.passwordStatus.textContent = 'As senhas não coincidem.';
    return;
  }
  if (els.passwordStatus) els.passwordStatus.textContent = 'Atualizando senha...';
  try {
    await state.user.updatePassword(pass);
    await firestoreService.markPasswordRotationCompleted();
    const wasForcedRotation = state.forceRotation;
    state.forceRotation = false;
    state.passwordPolicy = {
      ...(state.passwordPolicy || {}),
      mustChangePassword: false,
    };
    if (els.passwordStatus) els.passwordStatus.textContent = 'Senha alterada.';
    showMessage('Senha alterada.', 'success');
    if (els.passwordForm) els.passwordForm.reset();
    updatePasswordStrengthUI({ level: '', text: '' });
    checkPasswordMatch();

    if (wasForcedRotation) {
      window.location.href = 'dashboard.html';
      return;
    }
  } catch (err) {
    console.error('Erro alterar senha', err);
    if (err.code === 'auth/requires-recent-login') {
      if (els.passwordStatus) els.passwordStatus.textContent = 'Reautentique-se e tente novamente.';
    } else {
      if (els.passwordStatus) els.passwordStatus.textContent = 'Falha ao alterar senha.';
    }
    showMessage('Erro ao alterar senha.', 'error');
  } finally {
    setTimeout(() => {
      if (els.passwordStatus) els.passwordStatus.textContent = '';
    }, 4000);
  }
}

async function sendResetEmail() {
  if (!guardAuth()) return;
  try {
    await auth.sendPasswordResetEmail(state.user.email);
    showMessage('E-mail de reset enviado.', 'success');
  } catch (err) {
    console.error('Erro reset email', err);
    showMessage('Falha ao enviar reset.', 'error');
  }
}

async function populateWorkflowPreferences() {
  if (!els.prefDefaultWorkflow) return;

  els.prefDefaultWorkflow.innerHTML = '';

  const staticOptions = [
    { value: 'individual', label: 'Processo Individual' },
    { value: 'associativo', label: 'Processo Associativo' }
  ];

  staticOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    els.prefDefaultWorkflow.appendChild(option);
  });

  try {
    const dynamicWorkflows = await workflowService.getAllWorkflows();
    if (dynamicWorkflows && dynamicWorkflows.length > 0) {
      const separator = document.createElement('option');
      separator.disabled = true;
      separator.textContent = '──────────';
      els.prefDefaultWorkflow.appendChild(separator);

      dynamicWorkflows.forEach(wf => {
        const option = document.createElement('option');
        option.value = wf.id;
        option.textContent = wf.name;
        els.prefDefaultWorkflow.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Erro ao carregar workflows para preferências:', error);
  }
  
  // Tenta restaurar o valor se ainda for válido, senão volta para individual
  // Mas o loadLocalPreferences vai sobrescrever isso logo em seguida com o valor salvo no localStorage
}

async function loadLocalPreferences() {
  try {
    const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
    const currentTheme = typeof window.getThemePreference === 'function'
      ? window.getThemePreference()
      : (
        document.documentElement.getAttribute('data-theme') === 'dark'
        || document.documentElement.getAttribute('data-bs-theme') === 'dark'
      );
    const isDark = typeof prefs.darkMode === 'boolean' ? prefs.darkMode : currentTheme;
    if (els.prefDark) els.prefDark.checked = isDark;
    if (els.prefSound) els.prefSound.checked = !!prefs.sound;
    if (els.prefDesktop) els.prefDesktop.checked = !!prefs.desktopNotifications;
    
    await populateWorkflowPreferences();
    
    if (els.prefDefaultWorkflow) els.prefDefaultWorkflow.value = prefs.defaultWorkflow || 'individual';
    applyDarkMode(isDark);
  } catch (err) {
    console.warn('Erro ao carregar preferências locais:', err);
    // Ignora erros de parse (preferências inválidas) e segue com defaults
  }
  if (els.debugToggle) {
    els.debugToggle.checked = !!window.__DEBUG__;
  }
  await checkWorkflowPermissions();
}

function savePreferences() {
  const currentThemeIsDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const prefs = {
    darkMode: els.prefDark ? !!els.prefDark.checked : currentThemeIsDark,
    sound: !!els.prefSound?.checked,
    desktopNotifications: !!els.prefDesktop?.checked,
    defaultWorkflow: els.prefDefaultWorkflow ? els.prefDefaultWorkflow.value : 'individual'
  };
  localStorage.setItem('userPreferences', JSON.stringify(prefs));
  applyDarkMode(prefs.darkMode);
  els.prefsStatus.textContent = 'Preferências salvas.';
  showMessage('Preferências salvas.', 'success');
  setTimeout(() => { els.prefsStatus.textContent = ''; }, 2500);
}

function applyDarkMode(enabled) {
  if (typeof window.applyThemePreference === 'function') {
    window.applyThemePreference(!!enabled);
    return;
  }
  const root = document.documentElement;
  if (enabled) {
    root.setAttribute('data-theme', 'dark');
    root.setAttribute('data-bs-theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
    root.removeAttribute('data-bs-theme');
  }
}

function getStatusColor(status) {
  const colors = {
    online: 'success',
    offline: 'secondary',
    busy: 'warning',
    away: 'info'
  };
  return colors[String(status || '').toLowerCase()] || 'secondary';
}

async function loadWhatsAppDepartments() {
  if (!els.whatsappAgentDepartment) return;

  let departments = [];
  if (whatsappService?.DEPARTMENTS) {
    departments = Object.values(whatsappService.DEPARTMENTS);
  }

  if (departments.length === 0) {
    try {
      const configDoc = await db.collection('whatsappConfig').doc('settings').get();
      if (configDoc.exists && Array.isArray(configDoc.data()?.departments)) {
        departments = configDoc.data().departments;
      }
    } catch (error) {
      console.warn('Erro ao buscar departamentos do WhatsApp:', error);
    }
  }

  if (departments.length === 0) {
    departments = ['Aprovação', 'Formularios', 'CEHOP', 'Registro', 'Individual'];
  }

  els.whatsappAgentDepartment.innerHTML = '<option value="">Selecione seu departamento</option>';
  departments.forEach((department) => {
    const option = document.createElement('option');
    option.value = department;
    option.textContent = department;
    els.whatsappAgentDepartment.appendChild(option);
  });
}

async function loadWhatsAppAgentInfo() {
  if (!auth.currentUser) return;

  try {
    const profile = await firestoreService.getUserProfile(auth.currentUser.uid);
    if (profile) {
      state.profile = {
        ...(state.profile || {}),
        ...profile
      };
      populateFormFromProfile();
      updateViewModeValues(state.profile);
      if (profile.avatarUrl && els.avatarImg) {
        els.avatarImg.src = profile.avatarUrl;
      }
      syncSidebarProfile();
    }

    const agentData = profile?.whatsapp;
    if (agentData?.isAgent) {
      state.whatsappAgent = agentData;
      if (els.whatsappAgentCurrentDepartment) {
        els.whatsappAgentCurrentDepartment.textContent = agentData.department || '--';
      }
      if (els.whatsappAgentCurrentStatus) {
        els.whatsappAgentCurrentStatus.textContent = agentData.status || 'offline';
        els.whatsappAgentCurrentStatus.className = `badge bg-${getStatusColor(agentData.status)}`;
      }
      if (els.whatsappAgentActiveChats) {
        els.whatsappAgentActiveChats.textContent = agentData.activeChats || 0;
      }
      els.whatsappAgentRegisterSection?.classList.add('d-none');
      els.whatsappAgentInfoSection?.classList.remove('d-none');
      return;
    }

    state.whatsappAgent = null;
    els.whatsappAgentRegisterSection?.classList.remove('d-none');
    els.whatsappAgentInfoSection?.classList.add('d-none');
    await loadWhatsAppDepartments();
  } catch (error) {
    console.error('Erro ao carregar agente WhatsApp:', error);
  }
}

async function registerWhatsAppAgent(event) {
  event.preventDefault();
  if (!auth.currentUser) return;

  const department = els.whatsappAgentDepartment?.value || '';
  if (!department) {
    showMessage('Selecione um departamento.', 'warning');
    return;
  }

  try {
    if (!whatsappService) {
      const module = await import('./whatsappService.js');
      whatsappService = module.default;
    }

    const agentName = state.profile?.shortName || state.profile?.fullName || auth.currentUser.email;
    await whatsappService.registerAgent({
      name: agentName,
      fullName: state.profile?.fullName || agentName,
      department
    });

    showMessage('Registrado como agente WhatsApp!', 'success');
    if (els.whatsappAgentRegisterStatus) {
      els.whatsappAgentRegisterStatus.textContent = 'Registro concluido com sucesso.';
    }
    setTimeout(async () => {
      if (els.whatsappAgentRegisterStatus) {
        els.whatsappAgentRegisterStatus.textContent = '';
      }
      await loadWhatsAppAgentInfo();
    }, 1000);
  } catch (error) {
    console.error('Erro ao registrar agente:', error);
    showMessage('Erro ao registrar como agente.', 'error');
  }
}

async function changeDepartment() {
  if (!auth.currentUser || !state.whatsappAgent) return;

  if (!whatsappService) {
    try {
      const module = await import('./whatsappService.js');
      whatsappService = module.default;
    } catch (error) {
      console.warn('WhatsApp service indisponivel para alterar departamento:', error);
    }
  }

  const departments = (whatsappService?.DEPARTMENTS && Object.values(whatsappService.DEPARTMENTS).length > 0)
    ? Object.values(whatsappService.DEPARTMENTS)
    : ['Aprovação', 'Formularios', 'CEHOP', 'Registro', 'Individual'];

  const modalHtml = `
    <div class="modal fade" id="change-department-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-arrow-left-right me-2"></i>Alterar Departamento</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">
            <p class="text-muted">Departamento atual: <strong>${state.whatsappAgent.department || '--'}</strong></p>
            <div class="mb-3">
              <label for="new-department-select" class="form-label">Novo Departamento</label>
              <select class="form-select" id="new-department-select">
                <option value="">Selecione o novo departamento</option>
                ${departments.map((department) => `
                  <option value="${department}" ${department === state.whatsappAgent.department ? 'disabled' : ''}>
                    ${department}${department === state.whatsappAgent.department ? ' (atual)' : ''}
                  </option>
                `).join('')}
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="confirm-change-department-btn">
              <i class="bi bi-check-lg me-1"></i>Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('change-department-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modalElement = document.getElementById('change-department-modal');
  const modal = new window.bootstrap.Modal(modalElement);
  modalElement.querySelector('#confirm-change-department-btn')?.addEventListener('click', async () => {
    const newDepartment = modalElement.querySelector('#new-department-select')?.value || '';
    if (!newDepartment) {
      showMessage('Selecione um departamento.', 'warning');
      return;
    }

    try {
      await db.collection('users').doc(auth.currentUser.uid).update({
        'whatsapp.department': newDepartment
      });
      showMessage('Departamento atualizado!', 'success');
      modal.hide();
      setTimeout(async () => {
        await loadWhatsAppAgentInfo();
      }, 800);
    } catch (error) {
      console.error('Erro ao alterar departamento:', error);
      showMessage('Erro ao alterar departamento.', 'error');
    }
  });
  modalElement.addEventListener('hidden.bs.modal', () => modalElement.remove());
  modal.show();
}

function bindEvents() {
  initTooltips();
  initAvatarUpload();
  if (els.form) els.form.addEventListener('submit', saveProfile);
  if (els.toggleEditPersonal) {
    els.toggleEditPersonal.addEventListener('click', () => {
      toggleEditMode(!state.isEditMode);
    });
  }
  if (els.cancelEditPersonal) {
    els.cancelEditPersonal.addEventListener('click', () => {
      toggleEditMode(false);
      populateFormFromProfile();
    });
  }
  if (els.passwordForm) els.passwordForm.addEventListener('submit', changePassword);
  if (els.newPass) {
    els.newPass.addEventListener('input', (event) => {
      updatePasswordStrengthUI(calculatePasswordStrength(event.target.value));
      checkPasswordMatch();
    });
  }
  if (els.newPassConfirm) {
    els.newPassConfirm.addEventListener('input', checkPasswordMatch);
  }
  if (els.togglePasswordVisibility) {
    els.togglePasswordVisibility.addEventListener('click', togglePasswordVisibility);
  }
  if (els.refreshClaimsBtn) els.refreshClaimsBtn.addEventListener('click', () => loadClaims(true));
  if (els.debugToggle) els.debugToggle.addEventListener('change', () => { window.__DEBUG__ = els.debugToggle.checked; showMessage(`Debug ${window.__DEBUG__ ? 'ativado' : 'desativado'}`,'info'); });
  if (els.savePrefsBtn) els.savePrefsBtn.addEventListener('click', (e) => { e.preventDefault(); savePreferences(); });
  if (els.logout) els.logout.addEventListener('click', async () => { await auth.signOut(); redirectToLogin(); });
  if (els.sendResetEmailBtn) els.sendResetEmailBtn.addEventListener('click', sendResetEmail);
  if (els.whatsappAgentForm) els.whatsappAgentForm.addEventListener('submit', registerWhatsAppAgent);
  if (els.whatsappAgentChangeDeptBtn) els.whatsappAgentChangeDeptBtn.addEventListener('click', changeDepartment);
}

function initAuthListener() {
  auth.onAuthStateChanged(user => {
    if (!user) {
      redirectToLogin();
      return;
    }
    loadProfile();
  });
}

// Inicialização
bindEvents();
initAuthListener();

// Expor para debug
window.__PROFILE_PAGE__ = { state, reload: loadProfile };
