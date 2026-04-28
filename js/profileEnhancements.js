// profileEnhancements.js - Extensões da página de perfil dentro de index.html (2025-09-19)
// Mantém a arquitetura: reusa firestoreService + auth sem alterar assinaturas existentes.
// Não cria dependência circular e evita duplicar populateProfilePage (apenas estende UI).

import * as firestore from './firestoreService.js';
import { auth, db } from './auth.js';
import { showNotification } from './ui.js';
import workflowService from './workflowService.js';
import userPermissionService from './userPermissionService.js';

// Dynamic import of whatsappService
let whatsappService = null;
import('./whatsappService.js').then(module => {
  whatsappService = module.default;
  debugLog('WhatsApp Service carregado');
}).catch(err => {
  debugLog('WhatsApp Service não disponível:', err);
});

const els = {
  // Avatar elements (novo layout)
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

  // Header elements
  displayName: document.getElementById('profile-display-name'),
  displayEmail: document.getElementById('profile-display-email'),
  claimsBadges: document.getElementById('profile-claims-badges'),
  liveRegion: document.getElementById('profile-live-region'),

  // View mode elements
  viewFullname: document.getElementById('view-fullname'),
  viewShortname: document.getElementById('view-shortname'),
  viewCpf: document.getElementById('view-cpf'),
  viewEmail: document.getElementById('view-email'),
  personalViewMode: document.getElementById('personal-view-mode'),
  personalEditMode: document.getElementById('personal-edit-mode'),
  toggleEditPersonal: document.getElementById('toggle-edit-personal'),
  cancelEditPersonal: document.getElementById('cancel-edit-personal'),

  // Form elements
  profileSaveBtn: document.getElementById('profile-save-btn'),
  fullName: document.getElementById('profile-fullname'),
  shortName: document.getElementById('profile-shortname'),
  cpf: document.getElementById('profile-cpf'),
  email: document.getElementById('profile-email'),
  saveStatus: document.getElementById('profile-save-status'),

  // Password elements
  passwordForm: document.getElementById('password-change-form'),
  newPassword: document.getElementById('profile-new-password'),
  newPasswordConfirm: document.getElementById('profile-new-password-confirm'),
  passwordStatus: document.getElementById('password-status'),
  passwordStrengthFill: document.getElementById('password-strength-fill'),
  passwordStrengthText: document.getElementById('password-strength-text'),
  passwordMatch: document.getElementById('password-match'),
  togglePasswordVisibility: document.getElementById('toggle-password-visibility'),
  resetEmailBtn: document.getElementById('send-reset-email-btn'),

  // Preferences elements
  debugToggle: document.getElementById('debug-mode-toggle'),
  prefDark: document.getElementById('pref-dark-mode'),
  prefSound: document.getElementById('pref-sound'),
  prefDesktop: document.getElementById('pref-desktop-notification'),
  prefDefaultWorkflow: document.getElementById('pref-default-workflow'),
  workflowContainer: document.getElementById('workflow-preferences-container'),
  savePrefsBtn: document.getElementById('save-preferences-btn'),
  prefsStatus: document.getElementById('preferences-status'),

  // WhatsApp Agent elements
  whatsappAgentForm: document.getElementById('whatsapp-agent-form'),
  whatsappAgentDepartment: document.getElementById('whatsapp-agent-department'),
  whatsappAgentRegisterStatus: document.getElementById('whatsapp-agent-register-status'),
  whatsappAgentRegisterSection: document.getElementById('whatsapp-agent-register-section'),
  whatsappAgentInfoSection: document.getElementById('whatsapp-agent-info-section'),
  whatsappAgentCurrentDepartment: document.getElementById('whatsapp-agent-current-department'),
  whatsappAgentCurrentStatus: document.getElementById('whatsapp-agent-current-status'),
  whatsappAgentActiveChats: document.getElementById('whatsapp-agent-active-chats'),
  whatsappAgentChangeDeptBtn: document.getElementById('whatsapp-agent-change-dept-btn')
};

const state = {
  avatarFile: null,
  avatarRemoved: false,
  claims: null,
  saving: false,
  whatsappAgent: null,
  currentProfile: null,
  isEditMode: false
};

function debugLog(...args){ if(window.__DEBUG__) console.log('[perfil]', ...args); }

function ensureAuth(){
  if(!auth.currentUser){
    debugLog('Sem utilizador autenticado ainda');
    return false;
  }
  return true;
}

async function loadClaims(force=false){
  if(!ensureAuth()) return;
  try {
    if(force) await auth.currentUser.getIdToken(true);
    const token = await auth.currentUser.getIdTokenResult();
    state.claims = token.claims || {};
    renderClaims();
  } catch(err){
    debugLog('Erro claims', err);
    if(els.claimsBox) els.claimsBox.innerHTML = '<span class="text-error">Falha ao carregar claims</span>';
  }
}

function renderClaims(){
  const container = els.claimsBadges;
  if(!container) return;
  container.innerHTML='';
  const keys = Object.keys(state.claims||{}).filter(k=>!k.startsWith('firebase'));
  if(keys.length===0) return;

  keys.forEach(k=>{
    const badge = document.createElement('span');
    badge.className = 'badge bg-primary';
    badge.textContent = k;
    container.appendChild(badge);
  });
}

// ================= AVATAR DRAG & DROP =================

function initAvatarUpload(){
  if(!els.avatarDropzone) return;

  // Click to open file dialog
  els.avatarDropzone.addEventListener('click', () => {
    els.avatarInput?.click();
  });

  // Keyboard accessibility
  els.avatarDropzone.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      els.avatarInput?.click();
    }
  });

  // File input change
  if(els.avatarInput){
    els.avatarInput.addEventListener('change', handleAvatarFileSelect);
  }

  // Drag & Drop events
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    els.avatarDropzone.addEventListener(eventName, preventDefaults);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    els.avatarDropzone.addEventListener(eventName, () => {
      els.avatarDropzone.classList.add('drag-over');
      els.avatarDragIndicator?.classList.remove('d-none');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    els.avatarDropzone.addEventListener(eventName, () => {
      els.avatarDropzone.classList.remove('drag-over');
      els.avatarDragIndicator?.classList.add('d-none');
    });
  });

  els.avatarDropzone.addEventListener('drop', handleAvatarDrop);

  // Secondary buttons
  if(els.avatarChangeBtn){
    els.avatarChangeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      els.avatarInput?.click();
    });
  }

  if(els.avatarRemoveBtn){
    els.avatarRemoveBtn.addEventListener('click', handleAvatarRemove);
  }

  if(els.avatarSaveBtn){
    els.avatarSaveBtn.addEventListener('click', handleAvatarSave);
  }
}

function preventDefaults(e){
  e.preventDefault();
  e.stopPropagation();
}

function handleAvatarDrop(e){
  const files = e.dataTransfer?.files;
  if(files && files.length > 0){
    processAvatarFile(files[0]);
  }
}

function handleAvatarFileSelect(e){
  const file = e.target.files?.[0];
  if(file){
    processAvatarFile(file);
  }
}

function processAvatarFile(file){
  hideAvatarMessages();

  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if(!validTypes.includes(file.type)){
    showAvatarError('Formato invalido. Use JPG, PNG ou WebP.');
    return;
  }

  // Validate file size (1MB)
  if(file.size > 1024 * 1024){
    showAvatarError('Arquivo muito grande. Maximo 1MB.');
    return;
  }

  // Show preview immediately
  const reader = new FileReader();
  reader.onload = (e) => {
    if(els.avatarImg) els.avatarImg.src = e.target.result;
  };
  reader.readAsDataURL(file);

  // Store for later save
  state.avatarFile = file;
  state.avatarRemoved = false;

  // Show save and remove buttons
  els.avatarSaveBtn?.classList.remove('d-none');
  els.avatarRemoveBtn?.classList.remove('d-none');

  showAvatarSuccess('Imagem selecionada. Clique em "Salvar Foto" para confirmar.');
  announceToScreenReader('Imagem de perfil selecionada');
}

function handleAvatarRemove(e){
  e.stopPropagation();

  // Reset to default
  if(els.avatarImg) els.avatarImg.src = 'images/logologin.png';
  state.avatarFile = null;
  state.avatarRemoved = true;
  els.avatarRemoveBtn?.classList.add('d-none');
  if(els.avatarInput) els.avatarInput.value = '';

  // Show save button to confirm removal
  els.avatarSaveBtn?.classList.remove('d-none');

  showAvatarSuccess('Foto removida. Clique em "Salvar Foto" para confirmar.');
  announceToScreenReader('Foto de perfil removida');
}

async function handleAvatarSave(e){
  e.stopPropagation();
  if(!ensureAuth()) return;

  const saveBtn = els.avatarSaveBtn;

  // Show loading state
  if(saveBtn){
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...';
  }

  try {
    let avatarUrl = null;

    // Upload new avatar
    if(state.avatarFile){
      avatarUrl = await uploadAvatar(state.avatarFile);
      if(!avatarUrl){
        throw new Error('Falha no upload');
      }
    }

    // Save to Firestore (either new URL or null for removal)
    await db.collection('users').doc(auth.currentUser.uid).update({
      avatarUrl: state.avatarRemoved ? null : avatarUrl
    });

    // Update local state
    state.avatarFile = null;
    state.avatarRemoved = false;

    // Hide save button, show success
    if(saveBtn){
      saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvo!';
      saveBtn.classList.remove('btn-primary');
      saveBtn.classList.add('btn-success');
    }

    showNotification('Foto de perfil atualizada!', 'success');
    hideAvatarMessages();

    setTimeout(() => {
      if(saveBtn){
        saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar Foto';
        saveBtn.classList.remove('btn-success');
        saveBtn.classList.add('btn-primary');
        saveBtn.classList.add('d-none');
        saveBtn.disabled = false;
      }
    }, 1500);

  } catch(err){
    debugLog('Erro ao salvar avatar:', err);
    showNotification('Erro ao salvar foto.', 'error');

    if(saveBtn){
      saveBtn.innerHTML = '<i class="bi bi-x-lg me-1"></i>Erro';
      saveBtn.classList.remove('btn-primary');
      saveBtn.classList.add('btn-danger');
    }

    setTimeout(() => {
      if(saveBtn){
        saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar Foto';
        saveBtn.classList.remove('btn-danger');
        saveBtn.classList.add('btn-primary');
        saveBtn.disabled = false;
      }
    }, 2000);
  }
}

function showAvatarProgress(percent){
  els.avatarProgress?.classList.remove('d-none');
  const circle = els.avatarProgress?.querySelector('.circle-progress');
  const text = els.avatarProgress?.querySelector('.progress-text');
  if(circle){
    const circumference = 2 * Math.PI * 16;
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${offset}`;
  }
  if(text) text.textContent = `${percent}%`;
}

function hideAvatarProgress(){
  els.avatarProgress?.classList.add('d-none');
}

function showAvatarError(message){
  if(els.avatarError){
    els.avatarError.textContent = message;
    els.avatarError.classList.remove('d-none');
  }
}

function showAvatarSuccess(message){
  if(els.avatarSuccess){
    els.avatarSuccess.textContent = message;
    els.avatarSuccess.classList.remove('d-none');
  }
}

function hideAvatarMessages(){
  els.avatarError?.classList.add('d-none');
  els.avatarSuccess?.classList.add('d-none');
}

// ================= VIEW/EDIT MODE TOGGLE =================

function initViewEditMode(){
  if(els.toggleEditPersonal){
    els.toggleEditPersonal.addEventListener('click', () => {
      toggleEditMode(!state.isEditMode);
    });
  }

  if(els.cancelEditPersonal){
    els.cancelEditPersonal.addEventListener('click', () => {
      toggleEditMode(false);
      // Reset form to original values
      populateFormFromProfile();
    });
  }

  // Handle form submit in edit mode
  if(els.personalEditMode){
    els.personalEditMode.addEventListener('submit', handleProfileSubmit);
  }
}

function toggleEditMode(isEditing){
  state.isEditMode = isEditing;

  if(els.personalViewMode){
    els.personalViewMode.classList.toggle('d-none', isEditing);
  }
  if(els.personalEditMode){
    els.personalEditMode.classList.toggle('d-none', !isEditing);
  }
  if(els.toggleEditPersonal){
    els.toggleEditPersonal.setAttribute('aria-expanded', isEditing);
    els.toggleEditPersonal.innerHTML = isEditing
      ? '<i class="bi bi-x-lg"></i>'
      : '<i class="bi bi-pencil"></i>';
    els.toggleEditPersonal.setAttribute('aria-label',
      isEditing ? 'Cancelar edicao' : 'Editar informacoes pessoais');
  }

  if(isEditing){
    // Focus first input
    setTimeout(() => els.fullName?.focus(), 100);
  }

  announceToScreenReader(isEditing ? 'Modo de edicao ativado' : 'Modo de visualizacao');
}

function updateViewModeValues(data){
  if(els.viewFullname) els.viewFullname.textContent = data.fullName || '-';
  if(els.viewShortname) els.viewShortname.textContent = data.shortName || '-';
  if(els.viewCpf) els.viewCpf.textContent = data.cpf || '-';
  if(els.viewEmail) els.viewEmail.textContent = data.email || auth.currentUser?.email || '-';
  if(els.displayName) els.displayName.textContent = data.fullName || 'Usuario';
  if(els.displayEmail) els.displayEmail.textContent = data.email || auth.currentUser?.email || '';
}

function populateFormFromProfile(){
  if(state.currentProfile){
    if(els.fullName) els.fullName.value = state.currentProfile.fullName || '';
    if(els.shortName) els.shortName.value = state.currentProfile.shortName || '';
    if(els.cpf) els.cpf.value = state.currentProfile.cpf || '';
    if(els.email) els.email.value = auth.currentUser?.email || '';
  }
}

// ================= REAL-TIME VALIDATION =================

function initRealTimeValidation(){
  // CPF validation with formatting
  if(els.cpf){
    els.cpf.addEventListener('input', (e) => {
      formatCPF(e.target);
    });
  }

  // Password strength
  if(els.newPassword){
    els.newPassword.addEventListener('input', (e) => {
      const strength = calculatePasswordStrength(e.target.value);
      updatePasswordStrengthUI(strength);

      // Check match if confirm has value
      if(els.newPasswordConfirm?.value){
        checkPasswordMatch();
      }
    });
  }

  // Password match
  if(els.newPasswordConfirm){
    els.newPasswordConfirm.addEventListener('input', checkPasswordMatch);
  }

  // Password visibility toggle
  if(els.togglePasswordVisibility){
    els.togglePasswordVisibility.addEventListener('click', togglePasswordVisibility);
  }
}

function formatCPF(input){
  let value = input.value.replace(/\D/g, '');
  if(value.length > 11) value = value.slice(0, 11);

  if(value.length > 9){
    value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  } else if(value.length > 6){
    value = value.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  } else if(value.length > 3){
    value = value.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  }

  input.value = value;
}

function calculatePasswordStrength(password){
  if(!password) return { level: '', text: '' };

  let score = 0;
  if(password.length >= 6) score++;
  if(password.length >= 10) score++;
  if(/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if(/\d/.test(password)) score++;
  if(/[^a-zA-Z0-9]/.test(password)) score++;

  if(score <= 2) return { level: 'weak', text: 'Fraca' };
  if(score <= 3) return { level: 'medium', text: 'Media' };
  return { level: 'strong', text: 'Forte' };
}

function updatePasswordStrengthUI(strength){
  if(els.passwordStrengthFill){
    els.passwordStrengthFill.className = `password-strength-fill ${strength.level}`;
  }
  if(els.passwordStrengthText){
    els.passwordStrengthText.textContent = strength.text ? `Forca: ${strength.text}` : '';
  }
}

function checkPasswordMatch(){
  const password = els.newPassword?.value || '';
  const confirm = els.newPasswordConfirm?.value || '';

  if(!confirm){
    if(els.passwordMatch) els.passwordMatch.textContent = '';
    return;
  }

  if(password === confirm){
    if(els.passwordMatch){
      els.passwordMatch.textContent = 'Senhas coincidem';
      els.passwordMatch.className = 'form-text text-success';
    }
  } else {
    if(els.passwordMatch){
      els.passwordMatch.textContent = 'Senhas nao coincidem';
      els.passwordMatch.className = 'form-text text-danger';
    }
  }
}

function togglePasswordVisibility(){
  const input = els.newPassword;
  const btn = els.togglePasswordVisibility;
  if(!input || !btn) return;

  const isVisible = input.type === 'text';
  input.type = isVisible ? 'password' : 'text';
  btn.setAttribute('aria-pressed', !isVisible);
  btn.setAttribute('aria-label', isVisible ? 'Mostrar senha' : 'Ocultar senha');

  const icon = btn.querySelector('i');
  if(icon){
    icon.className = isVisible ? 'bi bi-eye' : 'bi bi-eye-slash';
  }
}

// ================= ACCESSIBILITY =================

function announceToScreenReader(message){
  if(els.liveRegion){
    els.liveRegion.textContent = message;
    setTimeout(() => { els.liveRegion.textContent = ''; }, 1000);
  }
}

async function uploadAvatar(file){
  if(!file) return null;
  if(file.size > 1024*1024){
    showAvatarError('Arquivo de avatar >1MB.');
    return null;
  }
  if(typeof firestore.uploadUserFile !== 'function'){
    showAvatarError('Upload de avatar indisponivel.');
    return null;
  }

  showAvatarProgress(0);

  try {
    const path = `users/${auth.currentUser.uid}/avatar_${Date.now()}_${file.name}`;

    const url = await firestore.uploadUserFile(file, path, (progress) => {
      showAvatarProgress(progress);
    });

    if(els.avatarImg) els.avatarImg.src = url;

    setTimeout(() => {
      hideAvatarProgress();
      showAvatarSuccess('Foto atualizada com sucesso!');
    }, 300);

    return url;
  } catch(err){
    debugLog('Erro upload avatar', err);
    hideAvatarProgress();
    showAvatarError('Erro ao enviar avatar.');
    return null;
  }
}

async function handleProfileSubmit(e){
  if(e) e.preventDefault();
  if(state.saving || !ensureAuth()) return;

  state.saving = true;
  const saveBtn = els.profileSaveBtn;

  // Show loading state
  if(saveBtn){
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...';
  }
  if(els.saveStatus) els.saveStatus.textContent = '';

  const data = {
    fullName: els.fullName?.value.trim() || '',
    shortName: els.shortName?.value.trim() || '',
    cpf: els.cpf?.value.trim() || '',
    email: auth.currentUser?.email || ''
  };

  try {
    // Upload avatar if changed
    if(state.avatarFile){
      const url = await uploadAvatar(state.avatarFile);
      if(url) data.avatarUrl = url;
    }

    // Handle avatar removal
    if(state.avatarRemoved){
      data.avatarUrl = '';
    }

    // Update basic profile via Cloud Function (fullName, shortName, cpf)
    await firestore.updateUserProfile({
      fullName: data.fullName,
      shortName: data.shortName,
      cpf: data.cpf
    });

    // Update avatarUrl directly in Firestore (Cloud Function doesn't support it)
    if(data.avatarUrl !== undefined){
      await db.collection('users').doc(auth.currentUser.uid).update({
        avatarUrl: data.avatarUrl || null
      });
    }

    // Update local state
    state.currentProfile = { ...state.currentProfile, ...data };
    state.avatarFile = null;
    state.avatarRemoved = false;

    // Update view mode values
    updateViewModeValues(data);

    // Success feedback
    showNotification('Perfil atualizado com sucesso!', 'success');

    if(saveBtn){
      saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvo!';
      saveBtn.classList.remove('btn-primary');
      saveBtn.classList.add('btn-success');
    }

    // Switch back to view mode after delay
    setTimeout(() => {
      toggleEditMode(false);
      if(saveBtn){
        saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar';
        saveBtn.classList.remove('btn-success');
        saveBtn.classList.add('btn-primary');
        saveBtn.disabled = false;
      }
    }, 1500);

  } catch(err) {
    debugLog('Erro ao salvar perfil:', err);
    showNotification('Erro ao salvar perfil.', 'error');

    if(saveBtn){
      saveBtn.innerHTML = '<i class="bi bi-x-lg me-1"></i>Erro';
      saveBtn.classList.remove('btn-primary');
      saveBtn.classList.add('btn-danger');
    }

    setTimeout(() => {
      if(saveBtn){
        saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar';
        saveBtn.classList.remove('btn-danger');
        saveBtn.classList.add('btn-primary');
        saveBtn.disabled = false;
      }
    }, 2000);
  } finally {
    state.saving = false;
  }
}

// handleAvatarChange replaced by initAvatarUpload with drag & drop support

async function handlePasswordChange(e){
  e.preventDefault();
  if(!ensureAuth()) return;
  const pass = els.newPassword.value.trim();
  const confirm = els.newPasswordConfirm.value.trim();
  if(pass.length < 6){
    els.passwordStatus.textContent = 'Senha muito curta';
    return;
  }
  if(pass !== confirm){
    els.passwordStatus.textContent = 'Senhas não coincidem';
    return;
  }
  els.passwordStatus.textContent = 'Alterando...';
  try {
    await auth.currentUser.updatePassword(pass);
    await firestore.markPasswordRotationCompleted();
    showNotification('Senha alterada.', 'success');
    els.passwordForm.reset();
    els.passwordStatus.textContent = 'Alterada.';
  } catch(err){
    if(err && err.code === 'auth/requires-recent-login'){
      els.passwordStatus.textContent = 'Reautentique-se e tente novamente.';
    } else {
      els.passwordStatus.textContent = 'Erro ao alterar.';
    }
    showNotification('Falha ao alterar senha.', 'error');
  } finally {
    setTimeout(()=>{ els.passwordStatus.textContent=''; }, 4000);
  }
}

async function handleResetEmail(){
  if(!ensureAuth()) return;
  try {
    await auth.sendPasswordResetEmail(auth.currentUser.email);
    showNotification('E-mail de redefinição enviado.', 'success');
  } catch {
    showNotification('Falha ao enviar e-mail.', 'error');
  }
}

async function loadLocalPreferences(){
  try {
    const prefs = JSON.parse(localStorage.getItem('userPreferences')||'{}');
    const currentTheme = typeof window.getThemePreference === 'function'
      ? window.getThemePreference()
      : document.documentElement.getAttribute('data-theme') === 'dark';
    const isDark = typeof prefs.darkMode === 'boolean' ? prefs.darkMode : currentTheme;
    if(els.prefDark) els.prefDark.checked = isDark;
    if(els.prefSound) els.prefSound.checked = !!prefs.sound;
    if(els.prefDesktop) els.prefDesktop.checked = !!prefs.desktopNotifications;

    await populateWorkflowPreferences();
    if(els.prefDefaultWorkflow) els.prefDefaultWorkflow.value = prefs.defaultWorkflow || 'individual';

    if(typeof prefs.darkMode === 'boolean') applyDarkMode(prefs.darkMode);
  } catch (e) {
    console.warn('Erro ao carregar preferencias:', e);
    // Ignora erro de parse e usa defaults
  }
  if(els.debugToggle) els.debugToggle.checked = !!window.__DEBUG__;

  // Mostrar configuracoes de workflow apenas para admins/managers
  checkWorkflowPermissions();
}

async function checkWorkflowPermissions() {
  if (!auth.currentUser) return;
  
  let isAdminOrManager = false;
  
  // 1. Check claims
  if (state.claims && (state.claims.admin || state.claims.manager)) {
    isAdminOrManager = true;
  }
  
  // 2. Check userPermissionService (Firestore role)
  if (!isAdminOrManager) {
    try {
      const perms = await userPermissionService.getUserPermissions(auth.currentUser.uid);
      if (perms.role === 'admin' || perms.role === 'manager') {
        isAdminOrManager = true;
      }
    } catch (e) {
      console.warn('Erro ao verificar permissões de workflow:', e);
    }
  }

  if (isAdminOrManager) {
    if (els.workflowContainer) els.workflowContainer.classList.remove('d-none');
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
}

// ================= WHATSAPP AGENT FUNCTIONS =================

async function loadWhatsAppAgentInfo(){
  if(!auth.currentUser) {
    debugLog(' Usuario nao autenticado');
    return;
  }

  debugLog(' Carregando informacoes do agente WhatsApp...');

  try {
    // Fetch user profile
    const profile = await firestore.getUserProfile(auth.currentUser.uid);
    state.currentProfile = profile;
    if (profile) {
      // Populate form fields
      if (els.fullName && !els.fullName.value) {
        els.fullName.value = profile.fullName || '';
      }
      if (els.shortName && !els.shortName.value) {
        els.shortName.value = profile.shortName || '';
      }
      if (els.cpf && !els.cpf.value) {
        els.cpf.value = profile.cpf || '';
      }
      if (els.email && !els.email.value) {
        els.email.value = auth.currentUser?.email || '';
      }

      // Update view mode and header
      const profileData = {
        fullName: profile.fullName || '',
        shortName: profile.shortName || '',
        cpf: profile.cpf || '',
        email: auth.currentUser?.email || ''
      };
      updateViewModeValues(profileData);

      // Update avatar if exists
      if(profile.avatarUrl && els.avatarImg){
        els.avatarImg.src = profile.avatarUrl;
        els.avatarRemoveBtn?.classList.remove('d-none');
      }
    }
    const agentData = profile.whatsapp;
    
    if(agentData && agentData.isAgent){
      // User IS agent → show info card
      state.whatsappAgent = agentData;
      
      if(els.whatsappAgentCurrentDepartment) {
        els.whatsappAgentCurrentDepartment.textContent = agentData.department || '--';
      }
      if(els.whatsappAgentCurrentStatus) {
        els.whatsappAgentCurrentStatus.textContent = agentData.status || 'offline';
        els.whatsappAgentCurrentStatus.className = `badge bg-${getStatusColor(agentData.status)}`;
      }
      if(els.whatsappAgentActiveChats) {
        els.whatsappAgentActiveChats.textContent = agentData.activeChats || 0;
      }
      
      if(els.whatsappAgentRegisterSection) {
        els.whatsappAgentRegisterSection.style.display = 'none';
      }
      if(els.whatsappAgentInfoSection) {
        els.whatsappAgentInfoSection.style.display = 'block';
      }
      
      debugLog(' Agente carregado:', agentData);
    } else {
      // User NOT agent → show registration form
      if(els.whatsappAgentRegisterSection) {
        els.whatsappAgentRegisterSection.style.display = 'block';
      }
      if(els.whatsappAgentInfoSection) {
        els.whatsappAgentInfoSection.style.display = 'none';
      }
      
      debugLog(' Usuário não é agente, carregando departamentos...');
      await loadWhatsAppDepartments();
    }
  } catch(err){
    debugLog(' Erro ao carregar info do agente:', err);
    console.error('Erro ao carregar WhatsApp Agent:', err);
  }
}

async function loadWhatsAppDepartments(){
  debugLog(' Iniciando loadWhatsAppDepartments...');
  
  const selectElement = document.getElementById('whatsapp-agent-department');
  
  if(!selectElement) {
    debugLog(' Elemento select não encontrado!');
    console.error('Elemento #whatsapp-agent-department não encontrado no DOM');
    return;
  }
  
  debugLog(' Elemento select encontrado:', selectElement);
  
  try {
    let departments = [];
    
    // MÉTODO 1: Importar whatsappService dinamicamente e obter DEPARTMENTS
    if(!whatsappService) {
      debugLog(' whatsappService não carregado ainda, tentando importar...');
      try {
        const module = await import('./whatsappService.js');
        whatsappService = module.default;
        debugLog(' whatsappService importado com sucesso!');
      } catch(err) {
        debugLog(' Erro ao importar whatsappService:', err);
      }
    }
    
    // MÉTODO 2: Tentar obter departamentos do whatsappService
    if(whatsappService && whatsappService.DEPARTMENTS){
      departments = Object.values(whatsappService.DEPARTMENTS);
      debugLog(' Departamentos obtidos do whatsappService:', departments);
    } else {
      debugLog(' whatsappService.DEPARTMENTS não disponível');
    }
    
    // MÉTODO 3: Fallback - buscar diretamente do Firestore
    if(departments.length === 0){
      debugLog(' Tentando buscar departamentos do Firestore...');
      try {
        const configDoc = await db.collection('whatsappConfig').doc('settings').get();
        if(configDoc.exists && configDoc.data().departments){
          departments = configDoc.data().departments;
          debugLog(' Departamentos obtidos do Firestore:', departments);
        } else {
          debugLog(' Documento whatsappConfig/settings não existe ou não tem departamentos');
        }
      } catch(err){
        debugLog(' Erro ao buscar departamentos do Firestore:', err);
      }
    }
    
    // MÉTODO 4: Fallback final - departamentos padrão (MESMOS DO MODAL ANTIGO)
    if(departments.length === 0){
  departments = ['Aprovação', 'Formularios', 'CEHOP', 'Registro', 'Individual'];
      debugLog(' Usando departamentos padrão (hardcoded):', departments);
    }
    
    // Preencher o select (MESMA LÓGICA DO MODAL ANTIGO)
    debugLog(' Preenchendo select com', departments.length, 'departamentos...');
    selectElement.innerHTML = '<option value="">Selecione seu departamento</option>';
    
    // Usar o mesmo método do modal antigo (.map().join())
    const options = departments.map(dept => `<option value="${dept}">${dept}</option>`).join('');
    selectElement.innerHTML += options;
    
    debugLog(' Select preenchido com sucesso! Total de opções:', selectElement.options.length);
    console.log(' Departamentos carregados:', departments);
    console.log(' Select HTML:', selectElement.outerHTML);
    
  } catch(err){
    debugLog(' Erro crítico ao carregar departamentos:', err);
    console.error('Erro ao carregar departamentos:', err);
    
    // Garantir que pelo menos a opção padrão existe
    if(selectElement.options.length === 0){
      selectElement.innerHTML = '<option value="">Erro ao carregar departamentos</option>';
    }
  }
}

async function registerWhatsAppAgent(e){
  e.preventDefault();
  
  if(!whatsappService || !auth.currentUser){
    showNotification('Serviço WhatsApp não disponível', 'error');
    return;
  }
  
  const department = els.whatsappAgentDepartment.value;
  if(!department){
    showNotification('Selecione um departamento', 'warning');
    return;
  }
  
  try {
    // Use shortName or fullName as agent name
    const agentName = state.currentProfile?.shortName || 
                      state.currentProfile?.fullName || 
                      auth.currentUser.email;
    
    debugLog('Registrando agente:', { name: agentName, department });
    
    await whatsappService.registerAgent({
      name: agentName,
      fullName: state.currentProfile?.fullName,
      department: department
    });
    
    showNotification(' Registrado como agente WhatsApp!', 'success');
    
    // Reload agent info
    setTimeout(() => loadWhatsAppAgentInfo(), 1500);
  } catch(err){
    debugLog('Erro ao registrar agente:', err);
    showNotification('Erro ao registrar como agente', 'error');
  }
}

async function changeDepartment(){
  if(!auth.currentUser) return;
  
  debugLog(' Iniciando mudança de departamento...');
  
  try {
    // Obter departamentos disponíveis
    let departments = [];
    
    if(whatsappService && whatsappService.DEPARTMENTS){
      departments = Object.values(whatsappService.DEPARTMENTS);
    } else {
  departments = ['Aprovação', 'Formularios', 'CEHOP', 'Registro', 'Individual'];
    }
    
    // Criar modal Bootstrap inline
    const modalHTML = `
      <div class="modal fade" id="change-department-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                <i class="bi bi-arrow-left-right me-2"></i>Alterar Departamento
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
              <p class="text-muted">Departamento atual: <strong>${state.whatsappAgent?.department || '--'}</strong></p>
              <div class="mb-3">
                <label for="new-department-select" class="form-label">Novo Departamento:</label>
                <select class="form-select" id="new-department-select" required>
                  <option value="">Selecione o novo departamento</option>
                  ${departments.map(dept => `
                    <option value="${dept}" ${dept === state.whatsappAgent?.department ? 'disabled' : ''}>
                      ${dept}${dept === state.whatsappAgent?.department ? ' (atual)' : ''}
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
    
    // Remover modal anterior se existir
    const oldModal = document.getElementById('change-department-modal');
    if(oldModal) oldModal.remove();
    
    // Adicionar modal ao body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Criar instância do modal Bootstrap
    const modalElement = document.getElementById('change-department-modal');
    const modal = new bootstrap.Modal(modalElement);
    
    // Handler do botão confirmar
    document.getElementById('confirm-change-department-btn').onclick = async () => {
      const newDept = document.getElementById('new-department-select').value;
      
      if(!newDept){
        showNotification('Selecione um departamento', 'warning');
        return;
      }
      
      if(newDept === state.whatsappAgent?.department){
        showNotification('Departamento já é o atual', 'info');
        return;
      }
      
      try {
        debugLog(' Atualizando departamento para:', newDept);
        
        // Update Firestore
        await db.collection('users')
          .doc(auth.currentUser.uid)
          .update({ 'whatsapp.department': newDept });
        
        showNotification(' Departamento atualizado!', 'success');
        modal.hide();
        
        // Reload agent info após 1s
        setTimeout(() => loadWhatsAppAgentInfo(), 1000);
      } catch(err){
        debugLog(' Erro ao alterar departamento:', err);
        showNotification('Erro ao alterar departamento', 'error');
      }
    };
    
    // Limpar modal do DOM quando fechar
    modalElement.addEventListener('hidden.bs.modal', () => {
      modalElement.remove();
    });
    
    // Mostrar modal
    modal.show();
    
  } catch(err){
    debugLog(' Erro ao preparar mudança de departamento:', err);
    showNotification('Erro ao abrir seletor de departamento', 'error');
  }
}

function getStatusColor(status){
  const colors = {
    'online': 'success',
    'offline': 'secondary',
    'busy': 'warning',
    'away': 'info'
  };
  return colors[status] || 'secondary';
}

// ================= END WHATSAPP AGENT FUNCTIONS =================


function savePreferences(){
  const prefs = {
    darkMode: els.prefDark?.checked || false,
    sound: els.prefSound?.checked || false,
    desktopNotifications: els.prefDesktop?.checked || false,
    defaultWorkflow: els.prefDefaultWorkflow?.value || 'individual'
  };
  localStorage.setItem('userPreferences', JSON.stringify(prefs));
  applyDarkMode(prefs.darkMode);
  if(els.prefsStatus) els.prefsStatus.textContent = 'Preferencias salvas.';
  showNotification('Preferencias salvas.', 'success');
  setTimeout(() => { if(els.prefsStatus) els.prefsStatus.textContent = ''; }, 2500);
}

function applyDarkMode(enabled){
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

function bind(){
  // Initialize new avatar upload with drag & drop
  initAvatarUpload();

  // Initialize view/edit mode toggle
  initViewEditMode();

  // Initialize real-time validation
  initRealTimeValidation();

  // Debug toggle
  if(els.debugToggle){
    els.debugToggle.addEventListener('change', () => {
      window.__DEBUG__ = els.debugToggle.checked;
      showNotification(`Debug ${window.__DEBUG__ ? 'ativado':'desativado'}`, 'info');
    });
  }

  // Password form
  if(els.passwordForm) els.passwordForm.addEventListener('submit', handlePasswordChange);
  if(els.resetEmailBtn) els.resetEmailBtn.addEventListener('click', handleResetEmail);

  // Preferences
  if(els.savePrefsBtn){
    els.savePrefsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      savePreferences();
    });
  }

  // WhatsApp Agent events
  if(els.whatsappAgentForm) els.whatsappAgentForm.addEventListener('submit', registerWhatsAppAgent);
  if(els.whatsappAgentChangeDeptBtn) els.whatsappAgentChangeDeptBtn.addEventListener('click', changeDepartment);
}

function initWhenVisible(){
  // Executa carga adicional somente quando a página perfil fica ativa
  const perfilPage = document.getElementById('page-perfil');
  if(!perfilPage) return;
  const observer = new MutationObserver(()=>{
    if(perfilPage.classList.contains('active')){
      debugLog('Perfil ativo → carregando claims, prefs & WhatsApp agent');
      loadLocalPreferences();
      loadClaims();
      loadWhatsAppAgentInfo(); // Auto-load agent info when profile opens
    }
  });
  observer.observe(perfilPage, { attributes:true, attributeFilter:['class'] });
}

function initAuthListener(){
  auth.onAuthStateChanged(user => {
    if(user && document.getElementById('page-perfil').classList.contains('active')){
      loadClaims();
    }
  });
}

// Inicialização imediata
bind();
initWhenVisible();
initAuthListener();

// Expor para debug
window.__PROFILE_ENHANCEMENTS__ = { state, loadClaims };
