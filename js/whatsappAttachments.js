/**
 * @file whatsappAttachments.js
 * @description Sistema de anexos para WhatsApp (imagens, documentos, áudio, vídeo)
 *
 * Funcionalidades:
 * - Upload de imagens/documentos para Firebase Storage
 * - Envio de anexos via WhatsApp Media API
 * - Download e visualização de anexos recebidos
 * - Galeria de mídia por conversa
 * - Compressão automática de imagens
 * - Validação de tipo e tamanho
 * - Preview antes de enviar
 * 
 * Limitações WhatsApp Business API:
 * - Imagens: até 5MB (JPEG, PNG)
 * - Documentos: até 100MB (PDF, DOCX, XLSX, etc.)
 * - Áudio: até 16MB (AAC, MP3, OGG)
 * - Vídeo: até 16MB (MP4, 3GPP)
 * 
 * Data: 2025-10-29
 */

import { db, auth, storage } from './auth.js';
import { showNotification } from './ui.js';
import cacheService from './cacheService.js';

if (window.__DEBUG__) console.log('[whatsappAttachments] Módulo carregado.');

// Tipos de mídia suportados
const MEDIA_TYPES = {
  IMAGE: {
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 5 * 1024 * 1024, // 5MB
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    whatsappType: 'image'
  },
  DOCUMENT: {
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv'
    ],
    maxSize: 100 * 1024 * 1024, // 100MB
    extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv'],
    whatsappType: 'document'
  },
  AUDIO: {
    mimes: [
      'audio/aac',
      'audio/mp4',
      'audio/mpeg',
      'audio/amr',
      'audio/ogg',
      'audio/ogg;codecs=opus',
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/wav'
    ],
    maxSize: 16 * 1024 * 1024, // 16MB
    extensions: ['.aac', '.m4a', '.mp3', '.amr', '.ogg', '.webm', '.wav'],
    whatsappType: 'audio'
  },
  VIDEO: {
    mimes: ['video/mp4', 'video/3gpp'],
    maxSize: 16 * 1024 * 1024, // 16MB
    extensions: ['.mp4', '.3gp'],
    whatsappType: 'video'
  }
};

// Estado do upload
const uploadState = {
  uploading: false,
  progress: 0,
  currentFile: null
};

const ATTACHMENT_PANEL_ID = 'whatsapp-attachment-panel';
const MEDIA_GALLERY_PANEL_ID = 'whatsapp-media-gallery-panel';

function getActiveReplyMetadata() {
  const uiApi = window.__WHATSAPP_UI__;
  if (!uiApi || typeof uiApi.getState !== 'function') {
    return null;
  }

  const state = uiApi.getState();
  const replyState = state?.replyingToMessage;
  if (!replyState?.messageId) {
    return null;
  }

  const rawPreview = typeof replyState.preview === 'string' ? replyState.preview.trim() : '';
  let preview = rawPreview;
  if (preview && preview.length > 280) {
    preview = `${preview.slice(0, 277)}...`;
  }

  return {
    messageId: replyState.messageId,
    text: preview || null,
    author: replyState.authorLabel || null,
    direction: replyState.direction || null
  };
}

function getCurrentChatPhoneNumberId() {
  const uiApi = window.__WHATSAPP_UI__;
  if (!uiApi || typeof uiApi.getState !== 'function') {
    return null;
  }

  const state = uiApi.getState();
  const phoneNumberId = state?.currentChat?.phoneNumberId;
  if (typeof phoneNumberId !== 'string') {
    return null;
  }

  const normalizedPhoneNumberId = phoneNumberId.trim();
  return normalizedPhoneNumberId || null;
}

/**
 * Valida arquivo antes do upload
 */
function validateFile(file) {
  // Detectar tipo de mídia
  let mediaType = null;
  
  for (const [type, config] of Object.entries(MEDIA_TYPES)) {
    if (config.mimes.includes(file.type)) {
      mediaType = type;
      break;
    }
  }

  if (!mediaType) {
    throw new Error(`Tipo de arquivo não suportado: ${file.type}`);
  }

  const config = MEDIA_TYPES[mediaType];

  // Validar tamanho
  if (file.size > config.maxSize) {
    const maxSizeMB = (config.maxSize / (1024 * 1024)).toFixed(0);
    throw new Error(`Arquivo muito grande. Máximo: ${maxSizeMB}MB`);
  }

  return { mediaType, config };
}

/**
 * Faz upload do arquivo para Firebase Storage
 */
async function uploadToStorage(file, chatId) {
  const { mediaType } = validateFile(file);
  
  // Gerar nome único
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `whatsapp/${chatId}/${timestamp}_${sanitizedName}`;

  try {
    uploadState.uploading = true;
    uploadState.currentFile = file.name;
    uploadState.progress = 0;

    // Criar referência
    const storageRef = storage.ref(path);

    // Upload com monitoramento de progresso
    const uploadTask = storageRef.put(file, {
      contentType: file.type,
      customMetadata: {
        chatId,
        uploadedBy: auth.currentUser?.uid || 'unknown',
        originalName: file.name,
        mediaType
      }
    });

    // Monitorar progresso
    uploadTask.on('state_changed', 
      snapshot => {
        uploadState.progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        updateUploadProgress(uploadState.progress);
      },
      error => {
        console.error('[whatsappAttachments] Erro no upload:', error);
        uploadState.uploading = false;
        throw error;
      }
    );

    // Aguardar conclusão
    await uploadTask;

    // Obter URL de download
    const downloadURL = await storageRef.getDownloadURL();

    uploadState.uploading = false;
    uploadState.progress = 100;

    if (window.__DEBUG__) {
      console.log('[whatsappAttachments] Upload concluído:', downloadURL);
    }

    return {
      url: downloadURL,
      path,
      name: file.name,
      size: file.size,
      type: file.type,
      mediaType
    };

  } catch (err) {
    uploadState.uploading = false;
    console.error('[whatsappAttachments] Erro ao fazer upload:', err);
    throw err;
  }
}

/**
 * Envia anexo via WhatsApp
 */
export async function sendAttachment(chatId, file, caption = '') {
  try {
    showNotification('Fazendo upload do arquivo...', 'info');

    // Upload para Storage
    const attachment = await uploadToStorage(file, chatId);
    const replyMetadata = getActiveReplyMetadata();

    // Salvar referência no Firestore
    const attachmentRef = await saveAttachmentReference(chatId, attachment);

    // Enviar via Cloud Function
    let messageId = null;
    
    try {
      const sendWhatsAppMedia = firebase.app().functions('southamerica-east1').httpsCallable('sendWhatsAppMedia');
      
      const requestPayload = {
        to: chatId,
        mediaUrl: attachment.url,
        mediaType: MEDIA_TYPES[attachment.mediaType].whatsappType,
        caption,
        fileName: attachment.name
      };

      const phoneNumberId = getCurrentChatPhoneNumberId();
      if (phoneNumberId) {
        requestPayload.phoneNumberId = phoneNumberId;
      }

      if (replyMetadata?.messageId) {
        requestPayload.context = {
          origin: 'agent-ui',
          replyTo: { messageId: replyMetadata.messageId },
          replyToMessageId: replyMetadata.messageId
        };
      }

      if (window.__DEBUG__) {
        console.log('[whatsappAttachments]  Enviando para Cloud Function:', {
          mediaType: requestPayload.mediaType,
          fileName: requestPayload.fileName,
          urlLength: attachment.url.length,
          fileType: attachment.type,
          hasContext: !!replyMetadata?.messageId
        });
      }

      const result = await sendWhatsAppMedia(requestPayload);
      
      messageId = result.data.messageId;
      
      if (window.__DEBUG__) {
        console.log('[whatsappAttachments]  Anexo enviado via WhatsApp, messageId:', messageId);
      }
    } catch (funcError) {
      console.error('[whatsappAttachments]  Erro ao enviar via WhatsApp API:', {
        error: funcError,
        code: funcError.code,
        message: funcError.message,
        details: funcError.details,
        mediaType: MEDIA_TYPES[attachment.mediaType]?.whatsappType,
        fileName: attachment.name
      });
      
      //  IMPORTANTE: Mostra erro visível ao usuário para áudio
      if (MEDIA_TYPES[attachment.mediaType]?.whatsappType === 'audio') {
        showNotification(
          `Erro ao enviar áudio: ${funcError.message || 'Erro desconhecido'}`, 
          'error'
        );
        throw funcError; // Re-throw para interromper salvamento
      }
      
      // Para outros tipos, continua salvando mesmo se falhar o envio
      console.warn('[whatsappAttachments] Continuando salvamento apesar do erro...');
    }

    // Salvar mensagem com anexo no Firestore
    const messageData = {
      ...attachment,
      caption,
      attachmentId: attachmentRef.id,
      direction: 'outbound',
      timestamp: new Date(),
      status: messageId ? 'sent' : 'pending'
    };
    
    // Adicionar messageId apenas se foi enviado com sucesso
    if (messageId) {
      messageData.messageId = messageId;
    }
    if (replyMetadata?.messageId) {
      messageData.replyTo = replyMetadata;
    }
    
    await saveMediaMessage(chatId, messageData);

    if (replyMetadata?.messageId && typeof window.__WHATSAPP_UI__?.cancelReply === 'function') {
      window.__WHATSAPP_UI__.cancelReply();
    }

    showNotification(
      messageId ? 'Anexo enviado com sucesso!' : 'Anexo salvo (aguardando envio)', 
      messageId ? 'success' : 'warning'
    );

    // Invalidar cache
    cacheService.invalidateByPattern(new RegExp(`^whatsapp_messages_${chatId}`));

    return { success: true, attachmentId: attachmentRef.id };

  } catch (err) {
    console.error('[whatsappAttachments] Erro ao enviar anexo:', err);
    
    const errorMessage = err.message || 'Erro ao enviar anexo';
    showNotification(errorMessage, 'error');
    
    throw err;
  }
}

/**
 * Salva referência do anexo no Firestore
 */
async function saveAttachmentReference(chatId, attachment) {
  try {
    const attachmentRef = await db.collection('chats')
      .doc(chatId)
      .collection('attachments')
      .add({
        ...attachment,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
        uploadedBy: auth.currentUser?.uid,
        uploadedByEmail: auth.currentUser?.email
      });

    return attachmentRef;
  } catch (err) {
    console.error('[whatsappAttachments] Erro ao salvar referência:', err);
    throw err;
  }
}

/**
 * Salva mensagem de mídia no Firestore
 */
async function saveMediaMessage(chatId, mediaData) {
  try {
    const chatRef = db.collection('chats').doc(chatId);
    
    // Preparar dados da mensagem (remover campos undefined)
    const messagePayload = {
      type: 'media',
      mediaType: mediaData.mediaType,
      mediaUrl: mediaData.url,
      fileName: mediaData.name,
      fileSize: mediaData.size,
      caption: mediaData.caption || '',
      direction: mediaData.direction || 'outbound',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      read: true,
      attachmentId: mediaData.attachmentId,
      agentId: auth.currentUser?.uid,
      agentName: auth.currentUser?.displayName,
      status: mediaData.status || 'sent'
    };

    // Adicionar messageId apenas se existir (não undefined)
    if (mediaData.messageId) {
      messagePayload.messageId = mediaData.messageId;
    }

    if (mediaData.replyTo?.messageId) {
      messagePayload.replyTo = {
        messageId: mediaData.replyTo.messageId,
        text: mediaData.replyTo.text || null,
        author: mediaData.replyTo.author || null,
        direction: mediaData.replyTo.direction || null
      };
    }

    const messageRef = await chatRef.collection('messages').add(messagePayload);

    // Atualizar última mensagem do chat
    await chatRef.update({
      lastMessageText: ` ${getMediaEmoji(mediaData.mediaType)} ${mediaData.caption || mediaData.name}`,
      lastMessageTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessageDirection: 'outbound'
    });

    return messageRef;
  } catch (err) {
    console.error('[whatsappAttachments] Erro ao salvar mensagem:', err);
    throw err;
  }
}

/**
 * Processa anexo recebido via webhook
 */
export async function processIncomingMedia(chatId, mediaData) {
  try {
    const { mediaId, mimeType, sha256, caption, phoneNumberId } = mediaData;

    // Baixar mídia da API do WhatsApp
    const downloadWhatsAppMedia = firebase.app().functions('southamerica-east1').httpsCallable('downloadWhatsAppMedia');

    const requestPayload = { mediaId };
    if (phoneNumberId) {
      requestPayload.phoneNumberId = phoneNumberId;
    }

    const result = await downloadWhatsAppMedia(requestPayload);

    // Upload para nosso Storage
    const storageUrl = await uploadMediaToStorage(chatId, result.data.mediaData, mimeType);

    // Salvar mensagem
    await db.collection('chats')
      .doc(chatId)
      .collection('messages')
      .add({
        type: 'media',
        mediaType: detectMediaType(mimeType),
        mediaUrl: storageUrl,
        mediaId,
        sha256,
        caption: caption || '',
        direction: 'inbound',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false
      });

    // Invalidar cache
    cacheService.invalidateByPattern(new RegExp(`^whatsapp_messages_${chatId}`));

    return { success: true, url: storageUrl };

  } catch (err) {
    console.error('[whatsappAttachments] Erro ao processar mídia recebida:', err);
    throw err;
  }
}

/**
 * Upload de mídia recebida para Storage
 */
async function uploadMediaToStorage(chatId, mediaDataBase64, mimeType) {
  const timestamp = Date.now();
  const ext = getExtensionFromMime(mimeType);
  const path = `whatsapp/${chatId}/received_${timestamp}${ext}`;

  try {
    const storageRef = storage.ref(path);
    
    // Converter base64 para blob
    const blob = base64ToBlob(mediaDataBase64, mimeType);
    
    await storageRef.put(blob, {
      contentType: mimeType,
      customMetadata: {
        chatId,
        source: 'whatsapp_incoming'
      }
    });

    return await storageRef.getDownloadURL();
  } catch (err) {
    console.error('[whatsappAttachments] Erro ao fazer upload de mídia recebida:', err);
    throw err;
  }
}

/**
 * Lista anexos de uma conversa
 */
export async function getChatAttachments(chatId, mediaType = null) {
  const cacheKey = `whatsapp_attachments_${chatId}_${mediaType || 'all'}`;

  try {
    return await cacheService.get(cacheKey, async () => {
      // Buscar mensagens com type='media' na subcoleção messages
      let query = db.collection('chats')
        .doc(chatId)
        .collection('messages')
        .where('type', '==', 'media')
        .orderBy('timestamp', 'desc');

      if (mediaType) {
        query = query.where('mediaType', '==', mediaType);
      }

      const snapshot = await query.limit(50).get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          url: data.mediaUrl,
          name: data.fileName || `${data.mediaType}_${doc.id}`,
          type: data.mimeType || 'application/octet-stream',
          mediaType: data.mediaType,
          size: data.fileSize || 0,
          uploadedAt: data.timestamp,
          caption: data.caption || '',
          direction: data.direction
        };
      });
    }, 'whatsappAttachments');

  } catch (err) {
    console.error('[whatsappAttachments] Erro ao listar anexos:', err);
    
    // Se o erro for por falta de índice, tentar sem ordenação
    if (err.message?.includes('index')) {
      console.warn('[whatsappAttachments] Tentando sem ordenação (índice ausente)');
      try {
        let query = db.collection('chats')
          .doc(chatId)
          .collection('messages')
          .where('type', '==', 'media');

        if (mediaType) {
          query = query.where('mediaType', '==', mediaType);
        }

        const snapshot = await query.limit(50).get();

        return snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            url: data.mediaUrl,
            name: data.fileName || `${data.mediaType}_${doc.id}`,
            type: data.mimeType || 'application/octet-stream',
            mediaType: data.mediaType,
            size: data.fileSize || 0,
            uploadedAt: data.timestamp,
            caption: data.caption || '',
            direction: data.direction
          };
        }).sort((a, b) => {
          // Ordenar manualmente por timestamp
          const timeA = a.uploadedAt?.toDate?.() || new Date(a.uploadedAt || 0);
          const timeB = b.uploadedAt?.toDate?.() || new Date(b.uploadedAt || 0);
          return timeB - timeA;
        });
      } catch (err2) {
        console.error('[whatsappAttachments] Erro mesmo sem ordenação:', err2);
        return [];
      }
    }
    
    return [];
  }
}

/**
 * Exclui anexo
 */
export async function deleteAttachment(chatId, attachmentId, storagePath) {
  try {
    // Excluir do Storage
    if (storagePath) {
      const storageRef = storage.ref(storagePath);
      await storageRef.delete();
    }

    // Excluir referência do Firestore
    await db.collection('chats')
      .doc(chatId)
      .collection('attachments')
      .doc(attachmentId)
      .delete();

    // Invalidar cache
    cacheService.invalidateByPattern(new RegExp(`^whatsapp_attachments_${chatId}`));

    showNotification('Anexo excluído', 'success');

    return { success: true };
  } catch (err) {
    console.error('[whatsappAttachments] Erro ao excluir anexo:', err);
    showNotification('Erro ao excluir anexo', 'error');
    throw err;
  }
}

/**
 * Abre modal de envio de anexo
 */
export function openAttachmentModal(chatId) {
  if (!chatId) {
    showNotification('Selecione um chat primeiro', 'warning');
    return;
  }

  const panel = document.getElementById(ATTACHMENT_PANEL_ID);
  if (!panel) {
    console.warn('[whatsappAttachments] Painel de anexo não encontrado');
    return;
  }

  const ensureSetup = () => setupPanelForChat(chatId);

  if (typeof window.__WHATSAPP_UI__?.showActionPanel === 'function') {
    window.__WHATSAPP_UI__.showActionPanel(ATTACHMENT_PANEL_ID, {
      focusSelector: '#whatsapp-attachment-file-input',
      onShow: ensureSetup
    });
  } else {
    ensureSetup();

    if (window.bootstrap?.Collapse) {
      const collapse = bootstrap.Collapse.getOrCreateInstance(panel, { toggle: false });
      collapse.show();
    } else {
      panel.classList.add('show');
    }
  }

  if (window.__DEBUG__) {
    console.log('[whatsappAttachments]  Painel de anexo exibido para chat:', chatId);
  }
}

/**
 * Exibe preview do arquivo selecionado
 */
function showFilePreview(file, container) {
  if (!container) return;

  const { mediaType } = validateFile(file);

  let previewHTML = '';

  if (mediaType === 'IMAGE') {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewHTML = `
        <div class="text-center">
          <img src="${e.target.result}" class="img-fluid rounded" style="max-height: 300px;">
          <p class="mt-2 text-muted">${file.name} (${formatFileSize(file.size)})</p>
        </div>
      `;
      container.innerHTML = previewHTML;
    };
    reader.readAsDataURL(file);
  } else {
    previewHTML = `
      <div class="text-center py-4">
        <i class="bi bi-file-earmark ${getFileIcon(mediaType)} display-1"></i>
        <p class="mt-2 mb-0"><strong>${file.name}</strong></p>
        <small class="text-muted">${formatFileSize(file.size)}</small>
      </div>
    `;
    container.innerHTML = previewHTML;
  }
}

/**
 * Abre galeria de mídia
 */
export async function openMediaGallery(chatId) {
  if (!chatId) {
    showNotification('Selecione um chat primeiro', 'warning');
    return;
  }

  const panel = document.getElementById(MEDIA_GALLERY_PANEL_ID);
  if (!panel) {
    console.warn('[whatsappAttachments] Painel de galeria não encontrado');
    return;
  }

  const container = document.getElementById('whatsapp-media-gallery-container');
  if (!container) return;

  const showLoading = () => {
    container.innerHTML = '<div class="text-center py-4"><div class="spinner-border"></div></div>';
  };

  const ensurePanelVisible = () => {
    if (typeof window.__WHATSAPP_UI__?.showActionPanel === 'function') {
      window.__WHATSAPP_UI__.showActionPanel(MEDIA_GALLERY_PANEL_ID, {
        onShow: showLoading
      });
    } else {
      showLoading();
      if (window.bootstrap?.Collapse) {
        bootstrap.Collapse.getOrCreateInstance(panel, { toggle: false }).show();
      } else {
        panel.classList.add('show');
      }
    }
  };

  ensurePanelVisible();

  try {
    const attachments = await getChatAttachments(chatId);

    if (attachments.length === 0) {
      container.innerHTML = '<p class="text-center text-muted py-4">Nenhum anexo nesta conversa</p>';
      return;
    }

    // Agrupar por tipo
    const grouped = {
      IMAGE: attachments.filter(a => a.mediaType === 'IMAGE'),
      DOCUMENT: attachments.filter(a => a.mediaType === 'DOCUMENT'),
      AUDIO: attachments.filter(a => a.mediaType === 'AUDIO'),
      VIDEO: attachments.filter(a => a.mediaType === 'VIDEO')
    };

    let html = '';

    // Renderizar imagens
    if (grouped.IMAGE.length > 0) {
      html += '<h6 class="mt-3">Imagens</h6><div class="row g-2">';
      grouped.IMAGE.forEach(img => {
        html += `
          <div class="col-md-3">
            <a href="${img.url}" target="_blank" class="d-block">
              <img src="${img.url}" class="img-fluid rounded" alt="${img.name}">
            </a>
          </div>
        `;
      });
      html += '</div>';
    }

    // Renderizar documentos
    if (grouped.DOCUMENT.length > 0) {
      html += '<h6 class="mt-4">Documentos</h6><div class="list-group">';
      grouped.DOCUMENT.forEach(doc => {
        html += `
          <a href="${doc.url}" target="_blank" class="list-group-item list-group-item-action">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <i class="bi bi-file-earmark-pdf me-2"></i>
                <strong>${doc.name}</strong>
              </div>
              <small class="text-muted">${formatFileSize(doc.size)}</small>
            </div>
          </a>
        `;
      });
      html += '</div>';
    }

    // Renderizar áudios
    if (grouped.AUDIO.length > 0) {
      html += '<h6 class="mt-4">Áudios</h6>';
      grouped.AUDIO.forEach(audio => {
        html += `
          <div class="card mb-2">
            <div class="card-body p-2">
              <audio controls class="w-100">
                <source src="${audio.url}" type="${audio.type}">
              </audio>
              <small class="text-muted">${audio.name}</small>
            </div>
          </div>
        `;
      });
    }

    // Renderizar vídeos
    if (grouped.VIDEO.length > 0) {
      html += '<h6 class="mt-4">Vídeos</h6>';
      grouped.VIDEO.forEach(video => {
        html += `
          <div class="card mb-2">
            <div class="card-body p-2">
              <video controls class="w-100" style="max-height: 300px;">
                <source src="${video.url}" type="${video.type}">
              </video>
              <small class="text-muted">${video.name}</small>
            </div>
          </div>
        `;
      });
    }

    container.innerHTML = html;

  } catch (err) {
    console.error('[whatsappAttachments] Erro ao carregar galeria:', err);
    container.innerHTML = '<p class="text-center text-danger">Erro ao carregar anexos</p>';
  }
}

/**
 * Atualiza barra de progresso do upload
 */
function updateUploadProgress(progress) {
  const progressBar = document.getElementById('attachment-upload-progress');
  
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
    progressBar.textContent = `${Math.round(progress)}%`;
    progressBar.parentElement.classList.toggle('d-none', progress === 0 || progress >= 100);
  }
}

// Utilitários

function detectMediaType(mimeType) {
  for (const [type, config] of Object.entries(MEDIA_TYPES)) {
    if (config.mimes.includes(mimeType)) {
      return type;
    }
  }
  return 'DOCUMENT'; // Fallback
}

function getExtensionFromMime(mimeType) {
  const mimeMap = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'video/mp4': '.mp4',
    'audio/mpeg': '.mp3'
  };
  return mimeMap[mimeType] || '.bin';
}

function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteArrays = [];

  for (let i = 0; i < byteCharacters.length; i++) {
    byteArrays.push(byteCharacters.charCodeAt(i));
  }

  return new Blob([new Uint8Array(byteArrays)], { type: mimeType });
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function getMediaEmoji(mediaType) {
  const emojiMap = {
    IMAGE: '',
    DOCUMENT: '',
    AUDIO: '',
    VIDEO: ''
  };
  return emojiMap[mediaType] || '';
}

function getFileIcon(mediaType) {
  const iconMap = {
    IMAGE: 'bi-file-image',
    DOCUMENT: 'bi-file-earmark-pdf',
    AUDIO: 'bi-file-music',
    VIDEO: 'bi-file-play'
  };
  return iconMap[mediaType] || 'bi-file-earmark';
}

/**
 * Função auxiliar para obter chat ativo
 */
function getActiveChatId() {
  if (window.__DEBUG__) console.log('[whatsappAttachments]  Procurando chat ativo...');
  
  // Método 1: Obter do whatsappUI (fonte mais confiável)
  if (window.__WHATSAPP_UI__?.getCurrentChatId) {
    const chatId = window.__WHATSAPP_UI__.getCurrentChatId();
    if (chatId) {
      if (window.__DEBUG__) console.log('[whatsappAttachments]  Chat ID do whatsappUI:', chatId);
      return chatId;
    }
    if (window.__DEBUG__) console.log('[whatsappAttachments]  whatsappUI.getCurrentChatId() retornou null');
  } else {
    if (window.__DEBUG__) console.log('[whatsappAttachments]  window.__WHATSAPP_UI__.getCurrentChatId não existe');
  }
  
  // Método 2: Estado global alternativo
  if (window.__WHATSAPP_STATE__?.activeChatId) {
    if (window.__DEBUG__) console.log('[whatsappAttachments]  Chat ID do estado global:', window.__WHATSAPP_STATE__.activeChatId);
    return window.__WHATSAPP_STATE__.activeChatId;
  }
  
  // Método 3: Tentar obter do DOM (elemento ativo)
  const selectedChat = document.querySelector('.chat-item.active[data-chat-id]');
  if (selectedChat) {
    const chatId = selectedChat.getAttribute('data-chat-id');
    if (chatId) {
      if (window.__DEBUG__) console.log('[whatsappAttachments]  Chat ID do DOM:', chatId);
      return chatId;
    }
  }
  
  // Método 4: Fallback - primeiro chat visível
  const anyChat = document.querySelector('.chat-item[data-chat-id]');
  if (anyChat) {
    const chatId = anyChat.getAttribute('data-chat-id');
    console.warn('[whatsappAttachments]  Nenhum chat ativo, usando primeiro da lista:', chatId);
    return chatId;
  }
  
  console.error('[whatsappAttachments]  Nenhum chat encontrado');
  return null;
}

/**
 * Inicializa event listeners
 */
function initializeAttachmentListeners() {
  if (window.__DEBUG__) console.log('[whatsappAttachments] Inicializando listeners do painel de anexos...');

  const panel = document.getElementById(ATTACHMENT_PANEL_ID);
  if (!panel) {
    console.error('[whatsappAttachments]  Painel de anexo não encontrado!');
    return;
  }

  if (window.bootstrap?.Collapse) {
    panel.addEventListener('show.bs.collapse', (event) => {
      if (window.__DEBUG__) console.log('[whatsappAttachments]  Painel de anexo abrindo...');

      const chatId = getActiveChatId();
      if (!chatId) {
        event.preventDefault();
        showNotification('Selecione um chat primeiro', 'warning');
        return;
      }

      setupPanelForChat(chatId);
    });
  }
}

/**
 * Configura modal para um chat específico
 */
function setupPanelForChat(chatId) {
  if (window.__DEBUG__) console.log(`[whatsappAttachments] Configurando painel de anexo para chat: ${chatId}`);

  // Limpar form
  const fileInput = document.getElementById('whatsapp-attachment-file-input');
  const captionInput = document.getElementById('whatsapp-attachment-caption');
  const preview = document.getElementById('whatsapp-attachment-preview');

  if (fileInput) fileInput.value = '';
  if (captionInput) captionInput.value = '';
  if (preview) preview.innerHTML = '';

  // Configurar handler de upload
  const uploadBtn = document.getElementById('whatsapp-attachment-upload-btn');
  if (uploadBtn) {
    uploadBtn.onclick = async () => {
      const file = fileInput?.files[0];
      const caption = captionInput?.value?.trim() || '';

      if (!file) {
        showNotification('Selecione um arquivo', 'warning');
        return;
      }

      try {
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Enviando...';

        await sendAttachment(chatId, file, caption);

        if (typeof window.__WHATSAPP_UI__?.hideActionPanel === 'function') {
          window.__WHATSAPP_UI__.hideActionPanel(ATTACHMENT_PANEL_ID);
        } else {
          const panel = document.getElementById(ATTACHMENT_PANEL_ID);
          if (window.bootstrap?.Collapse && panel) {
            bootstrap.Collapse.getOrCreateInstance(panel, { toggle: false }).hide();
          } else if (panel) {
            panel.classList.remove('show');
          }
        }

      } catch (err) {
        console.error('Erro ao enviar anexo:', err);
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="bi bi-send-fill"></i> Enviar';
      }
    };
  }

  // Listener de seleção de arquivo (preview)
  if (fileInput) {
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        showFilePreview(file, preview);
      }
    };
  }
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAttachmentListeners);
} else {
  // DOM já carregado
  initializeAttachmentListeners();
}

// API pública
export const whatsappAttachments = {
  send: sendAttachment,
  processIncoming: processIncomingMedia,
  getAttachments: getChatAttachments,
  delete: deleteAttachment,
  openModal: openAttachmentModal,
  openGallery: openMediaGallery, //  Nome correto da função
  MEDIA_TYPES,
  init: initializeAttachmentListeners
};

// Expor globalmente
window.__WHATSAPP_ATTACHMENTS__ = whatsappAttachments;

export default whatsappAttachments;
