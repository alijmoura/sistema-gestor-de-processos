/**
 * @file whatsappCalls.js
 * @description Sistema de chamadas de voz/vídeo para WhatsApp usando WebRTC
 *
 * IMPORTANTE: WhatsApp Business Cloud API não suporta chamadas nativamente.
 * Esta implementação usa WebRTC P2P para criar chamadas diretas navegador-navegador.
 * 
 * Funcionalidades:
 * - Chamadas de voz (audio only)
 * - Chamadas de vídeo (audio + video)
 * - Sinalização via Firestore (signaling)
 * - Notificações de chamada recebida
 * - Controles de chamada (mute, hold, transfer)
 * - Histórico de chamadas
 * 
 * Data: 2025-11-05
 */

import { db, auth } from './auth.js';
import whatsappService from './whatsappService.js';
import { showNotification } from './ui.js';

if (window.__DEBUG__) console.log('[whatsappCalls] Módulo carregado.');

// Configuração ICE (STUN/TURN servers)
const ICE_SERVERS = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ]
    }
    // TURN servers podem ser adicionados aqui se necessário
    // { urls: 'turn:your-turn-server.com', username: 'user', credential: 'pass' }
  ]
};

// Status de chamada
const CALL_STATUS = {
  INITIATING: 'initiating',     // Iniciando chamada
  RINGING: 'ringing',           // Chamando (tocando para o destinatário)
  CONNECTING: 'connecting',     // Conectando
  CONNECTED: 'connected',       // Chamada ativa
  ON_HOLD: 'on-hold',          // Em espera
  ENDED: 'ended',              // Finalizada
  MISSED: 'missed',            // Não atendida
  REJECTED: 'rejected',        // Rejeitada
  FAILED: 'failed'             // Falha
};

// Tipos de chamada
const CALL_TYPES = {
  VOICE: 'voice',   // Apenas áudio
  VIDEO: 'video'    // Áudio + vídeo
};

// Estado da chamada atual
const callState = {
  activeCall: null,
  peerConnection: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isVideoEnabled: true,
  isOnHold: false,
  callListener: null,
  callDirection: null, // 'outgoing' ou 'incoming'
  callType: null,
  startTime: null,
  duration: 0,
  timerInterval: null
};

/**
 * Inicializa o módulo de chamadas
 */
export async function initCallSystem() {
  try {
    // Verificar suporte WebRTC
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[whatsappCalls] WebRTC não suportado neste navegador');
      return false;
    }

    // Verificar permissões de mídia
    await checkMediaPermissions();

    // Escutar chamadas recebidas
    listenForIncomingCalls();

    console.log('[whatsappCalls]  Sistema de chamadas inicializado');
    return true;
  } catch (err) {
    console.error('[whatsappCalls] Erro ao inicializar:', err);
    return false;
  }
}

/**
 * Verifica permissões de mídia (áudio/vídeo)
 */
async function checkMediaPermissions() {
  try {
    const permissions = await Promise.all([
      navigator.permissions.query({ name: 'microphone' }),
      navigator.permissions.query({ name: 'camera' })
    ]);

    if (window.__DEBUG__) {
      console.log('[whatsappCalls] Permissões:', {
        microphone: permissions[0].state,
        camera: permissions[1].state
      });
    }

    return {
      microphone: permissions[0].state,
      camera: permissions[1].state
    };
  } catch (err) {
    console.warn('[whatsappCalls] Erro ao verificar permissões:', err);
    return { microphone: 'prompt', camera: 'prompt' };
  }
}

/**
 * Inicia uma chamada de voz
 */
export async function startVoiceCall(chatId, recipientPhone) {
  return await initiateCall(chatId, recipientPhone, CALL_TYPES.VOICE);
}

/**
 * Inicia uma chamada de vídeo
 */
export async function startVideoCall(chatId, recipientPhone) {
  return await initiateCall(chatId, recipientPhone, CALL_TYPES.VIDEO);
}

/**
 * Inicia uma chamada (voz ou vídeo)
 */
async function initiateCall(chatId, recipientPhone, callType) {
  try {
    // Verificar se já há chamada ativa
    if (callState.activeCall) {
      throw new Error('Já existe uma chamada ativa');
    }

    const userId = auth.currentUser?.uid;
    if (!userId) {
      throw new Error('Usuário não autenticado');
    }

    // Solicitar acesso à mídia
    const constraints = {
      audio: true,
      video: callType === CALL_TYPES.VIDEO
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    callState.localStream = stream;

    // Criar documento de chamada no Firestore
    const callRef = await db.collection('whatsappCalls').add({
      chatId,
      callerId: userId,
      callerPhone: recipientPhone, // Número do agente (se disponível)
      recipientPhone,
      type: callType,
      status: CALL_STATUS.INITIATING,
      direction: 'outgoing',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    callState.activeCall = callRef.id;
    callState.callDirection = 'outgoing';
    callState.callType = callType;
    callState.startTime = new Date();

    // Criar peer connection
    await createPeerConnection(callRef.id);

    // Adicionar stream local ao peer connection
    stream.getTracks().forEach(track => {
      callState.peerConnection.addTrack(track, stream);
    });

    // Criar oferta
    const offer = await callState.peerConnection.createOffer();
    await callState.peerConnection.setLocalDescription(offer);

    // Salvar oferta no Firestore para sinalização
    await callRef.update({
      offer: {
        type: offer.type,
        sdp: offer.sdp
      },
      status: CALL_STATUS.RINGING
    });

    // Enviar notificação WhatsApp para o cliente
    try {
      const callTypeText = callType === CALL_TYPES.VIDEO ? 'vídeo' : 'voz';
      await whatsappService.sendMessage(
        chatId,
        ` *Chamada de ${callTypeText}*\n\nO agente está te ligando. Clique no link abaixo para atender:\n\n [Atender Chamada](https://sistema-gestor-de-processos.web.app/call.html?id=${callRef.id})\n\n_Esta funcionalidade requer navegador compatível com WebRTC._`
      );
    } catch (msgErr) {
      console.warn('[whatsappCalls] Erro ao enviar mensagem WhatsApp:', msgErr);
    }

    // Escutar resposta do destinatário
    listenForCallAnswer(callRef.id);

    // Atualizar UI
    showCallUI('outgoing', callType);

    // Iniciar timer de duração
    startCallTimer();

    console.log('[whatsappCalls]  Chamada iniciada:', callRef.id);

    return {
      success: true,
      callId: callRef.id,
      callType
    };

  } catch (err) {
    console.error('[whatsappCalls] Erro ao iniciar chamada:', err);
    
    // Limpar recursos
    cleanupCall();

    throw err;
  }
}

/**
 * Cria conexão WebRTC peer-to-peer
 */
async function createPeerConnection(callId) {
  try {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    callState.peerConnection = pc;

    // Event: ICE candidate
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await db.collection('whatsappCalls').doc(callId)
          .collection('iceCandidates')
          .add({
            candidate: event.candidate.toJSON(),
            direction: callState.callDirection,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });

        if (window.__DEBUG__) {
          console.log('[whatsappCalls] ICE candidate enviado');
        }
      }
    };

    // Event: Conexão estabelecida
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[whatsappCalls] Connection state:', state);

      if (state === 'connected') {
        updateCallStatus(callId, CALL_STATUS.CONNECTED);
      } else if (state === 'failed' || state === 'disconnected') {
        endCall(callId, state === 'failed' ? CALL_STATUS.FAILED : CALL_STATUS.ENDED);
      }
    };

    // Event: Track remoto recebido (stream do outro participante)
    pc.ontrack = (event) => {
      console.log('[whatsappCalls] Stream remoto recebido');
      callState.remoteStream = event.streams[0];
      
      // Atualizar UI com stream remoto
      const remoteVideo = document.getElementById('whatsapp-call-remote-video');
      if (remoteVideo) {
        remoteVideo.srcObject = event.streams[0];
      }
    };

    return pc;

  } catch (err) {
    console.error('[whatsappCalls] Erro ao criar peer connection:', err);
    throw err;
  }
}

/**
 * Escuta respostas de chamada (answer)
 */
function listenForCallAnswer(callId) {
  const callRef = db.collection('whatsappCalls').doc(callId);

  const unsubscribe = callRef.onSnapshot(async (snapshot) => {
    const data = snapshot.data();
    
    if (!data) return;

    // Se recebeu answer
    if (data.answer && !callState.peerConnection.currentRemoteDescription) {
      const answer = new RTCSessionDescription(data.answer);
      await callState.peerConnection.setRemoteDescription(answer);
      
      console.log('[whatsappCalls]  Resposta recebida e processada');
      
      // Escutar ICE candidates do destinatário
      listenForIceCandidates(callId, 'incoming');
    }

    // Atualizar status
    if (data.status === CALL_STATUS.REJECTED) {
      showNotification('Chamada rejeitada', 'warning');
      endCall(callId, CALL_STATUS.REJECTED);
      unsubscribe();
    } else if (data.status === CALL_STATUS.ENDED) {
      endCall(callId, CALL_STATUS.ENDED);
      unsubscribe();
    }
  });

  callState.callListener = unsubscribe;
}

/**
 * Escuta ICE candidates do peer remoto
 */
function listenForIceCandidates(callId, direction) {
  const candidatesRef = db.collection('whatsappCalls')
    .doc(callId)
    .collection('iceCandidates')
    .where('direction', '==', direction);

  candidatesRef.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        const candidate = new RTCIceCandidate(data.candidate);
        
        try {
          await callState.peerConnection.addIceCandidate(candidate);
          
          if (window.__DEBUG__) {
            console.log('[whatsappCalls] ICE candidate adicionado');
          }
        } catch (err) {
          console.error('[whatsappCalls] Erro ao adicionar ICE candidate:', err);
        }
      }
    });
  });
}

/**
 * Atende uma chamada recebida
 */
export async function answerCall(callId) {
  try {
    const callRef = db.collection('whatsappCalls').doc(callId);
    const callDoc = await callRef.get();

    if (!callDoc.exists) {
      throw new Error('Chamada não encontrada');
    }

    const callData = callDoc.data();

    // Solicitar acesso à mídia
    const constraints = {
      audio: true,
      video: callData.type === CALL_TYPES.VIDEO
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    callState.localStream = stream;
    callState.activeCall = callId;
    callState.callDirection = 'incoming';
    callState.callType = callData.type;
    callState.startTime = new Date();

    // Criar peer connection
    await createPeerConnection(callId);

    // Adicionar stream local
    stream.getTracks().forEach(track => {
      callState.peerConnection.addTrack(track, stream);
    });

    // Processar oferta recebida
    const offer = new RTCSessionDescription(callData.offer);
    await callState.peerConnection.setRemoteDescription(offer);

    // Criar resposta (answer)
    const answer = await callState.peerConnection.createAnswer();
    await callState.peerConnection.setLocalDescription(answer);

    // Salvar resposta no Firestore
    await callRef.update({
      answer: {
        type: answer.type,
        sdp: answer.sdp
      },
      status: CALL_STATUS.CONNECTED,
      answeredAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Escutar ICE candidates do caller
    listenForIceCandidates(callId, 'outgoing');

    // Atualizar UI
    showCallUI('incoming', callData.type);

    // Iniciar timer
    startCallTimer();

    console.log('[whatsappCalls]  Chamada atendida');

    return { success: true };

  } catch (err) {
    console.error('[whatsappCalls] Erro ao atender chamada:', err);
    
    // Limpar recursos
    cleanupCall();

    throw err;
  }
}

/**
 * Rejeita uma chamada recebida
 */
export async function rejectCall(callId) {
  try {
    await db.collection('whatsappCalls').doc(callId).update({
      status: CALL_STATUS.REJECTED,
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      rejectedBy: auth.currentUser?.uid
    });

    cleanupCall();

    console.log('[whatsappCalls] Chamada rejeitada');

    return { success: true };

  } catch (err) {
    console.error('[whatsappCalls] Erro ao rejeitar chamada:', err);
    throw err;
  }
}

/**
 * Finaliza uma chamada ativa
 */
export async function endCall(callId = null, status = CALL_STATUS.ENDED) {
  try {
    const activeCallId = callId || callState.activeCall;
    
    if (!activeCallId) {
      console.warn('[whatsappCalls] Nenhuma chamada ativa para finalizar');
      return;
    }

    // Atualizar status no Firestore
    await updateCallStatus(activeCallId, status);

    // Atualizar duração
    if (callState.startTime) {
      const duration = Math.floor((new Date() - callState.startTime) / 1000);
      await db.collection('whatsappCalls').doc(activeCallId).update({
        duration,
        endedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    // Limpar recursos locais
    cleanupCall();

    // Fechar UI de chamada
    hideCallUI();

    console.log('[whatsappCalls] Chamada finalizada');

    return { success: true };

  } catch (err) {
    console.error('[whatsappCalls] Erro ao finalizar chamada:', err);
    throw err;
  }
}

/**
 * Atualiza status da chamada no Firestore
 */
async function updateCallStatus(callId, status) {
  try {
    await db.collection('whatsappCalls').doc(callId).update({
      status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('[whatsappCalls] Erro ao atualizar status:', err);
  }
}

/**
 * Limpa recursos da chamada (streams, connections, listeners)
 */
function cleanupCall() {
  // Parar timer
  if (callState.timerInterval) {
    clearInterval(callState.timerInterval);
    callState.timerInterval = null;
  }

  // Fechar streams
  if (callState.localStream) {
    callState.localStream.getTracks().forEach(track => track.stop());
    callState.localStream = null;
  }

  if (callState.remoteStream) {
    callState.remoteStream.getTracks().forEach(track => track.stop());
    callState.remoteStream = null;
  }

  // Fechar peer connection
  if (callState.peerConnection) {
    callState.peerConnection.close();
    callState.peerConnection = null;
  }

  // Parar listeners
  if (callState.callListener) {
    callState.callListener();
    callState.callListener = null;
  }

  // Resetar estado
  callState.activeCall = null;
  callState.callDirection = null;
  callState.callType = null;
  callState.isMuted = false;
  callState.isVideoEnabled = true;
  callState.isOnHold = false;
  callState.startTime = null;
  callState.duration = 0;
}

/**
 * Mute/Unmute áudio
 */
export function toggleMute() {
  if (!callState.localStream) return;

  const audioTracks = callState.localStream.getAudioTracks();
  audioTracks.forEach(track => {
    track.enabled = !track.enabled;
  });

  callState.isMuted = !callState.isMuted;

  // Atualizar UI
  const muteBtn = document.getElementById('whatsapp-call-mute-btn');
  if (muteBtn) {
    muteBtn.innerHTML = callState.isMuted 
      ? '<i class="bi bi-mic-mute-fill"></i>' 
      : '<i class="bi bi-mic-fill"></i>';
    muteBtn.classList.toggle('btn-danger', callState.isMuted);
  }

  return callState.isMuted;
}

/**
 * Ativar/Desativar vídeo
 */
export function toggleVideo() {
  if (!callState.localStream) return;

  const videoTracks = callState.localStream.getVideoTracks();
  videoTracks.forEach(track => {
    track.enabled = !track.enabled;
  });

  callState.isVideoEnabled = !callState.isVideoEnabled;

  // Atualizar UI
  const videoBtn = document.getElementById('whatsapp-call-video-btn');
  if (videoBtn) {
    videoBtn.innerHTML = callState.isVideoEnabled 
      ? '<i class="bi bi-camera-video-fill"></i>' 
      : '<i class="bi bi-camera-video-off-fill"></i>';
    videoBtn.classList.toggle('btn-danger', !callState.isVideoEnabled);
  }

  return callState.isVideoEnabled;
}

/**
 * Colocar chamada em espera (hold)
 */
export async function toggleHold() {
  if (!callState.activeCall || !callState.peerConnection) return;

  callState.isOnHold = !callState.isOnHold;

  // Desabilitar todos os tracks quando em hold
  if (callState.localStream) {
    callState.localStream.getTracks().forEach(track => {
      track.enabled = !callState.isOnHold;
    });
  }

  // Atualizar status no Firestore
  await db.collection('whatsappCalls').doc(callState.activeCall).update({
    status: callState.isOnHold ? CALL_STATUS.ON_HOLD : CALL_STATUS.CONNECTED,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Atualizar UI
  const holdBtn = document.getElementById('whatsapp-call-hold-btn');
  if (holdBtn) {
    holdBtn.innerHTML = callState.isOnHold 
      ? '<i class="bi bi-play-fill"></i>' 
      : '<i class="bi bi-pause-fill"></i>';
    holdBtn.classList.toggle('btn-warning', callState.isOnHold);
  }

  return callState.isOnHold;
}

/**
 * Inicia timer de duração da chamada
 */
function startCallTimer() {
  if (callState.timerInterval) {
    clearInterval(callState.timerInterval);
  }

  callState.timerInterval = setInterval(() => {
    if (!callState.startTime) return;

    const elapsed = Math.floor((new Date() - callState.startTime) / 1000);
    callState.duration = elapsed;

    // Atualizar UI do timer
    const timerEl = document.getElementById('whatsapp-call-timer');
    if (timerEl) {
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  }, 1000);
}

/**
 * Escuta chamadas recebidas para o usuário atual
 */
function listenForIncomingCalls() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const callsRef = db.collection('whatsappCalls')
    .where('recipientId', '==', userId)
    .where('status', 'in', [CALL_STATUS.INITIATING, CALL_STATUS.RINGING]);

  callsRef.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const callData = change.doc.data();
        const callId = change.doc.id;

        // Mostrar notificação de chamada recebida
        showIncomingCallNotification(callId, callData);
      }
    });
  });
}

/**
 * Mostra notificação de chamada recebida
 */
function showIncomingCallNotification(callId, callData) {
  const typeText = callData.type === CALL_TYPES.VIDEO ? 'vídeo' : 'voz';
  
  // Criar notificação visual
  const notification = document.createElement('div');
  notification.className = 'position-fixed top-0 end-0 m-3 p-3 bg-primary text-white rounded shadow-lg';
  notification.style.zIndex = '9999';
  notification.innerHTML = `
    <h5><i class="bi bi-telephone-inbound-fill me-2"></i>Chamada de ${typeText} recebida</h5>
    <p class="mb-3">De: ${callData.callerName || 'Cliente'}</p>
    <div class="d-flex gap-2">
      <button class="btn btn-success btn-sm" onclick="window.__WHATSAPP_CALLS__.answerCall('${callId}')">
        <i class="bi bi-telephone-fill me-1"></i>Atender
      </button>
      <button class="btn btn-danger btn-sm" onclick="window.__WHATSAPP_CALLS__.rejectCall('${callId}')">
        <i class="bi bi-telephone-x-fill me-1"></i>Rejeitar
      </button>
    </div>
  `;

  document.body.appendChild(notification);

  // Tocar som de chamada (se disponível)
  playRingtone();

  // Remover notificação após 30 segundos
  setTimeout(() => {
    notification.remove();
    stopRingtone();
  }, 30000);
}

/**
 * Toca som de chamada recebida
 */
function playRingtone() {
  // TODO: Adicionar arquivo de áudio de ringtone
  console.log('[whatsappCalls]  Tocando ringtone...');
}

/**
 * Para som de chamada
 */
function stopRingtone() {
  console.log('[whatsappCalls]  Parando ringtone');
}

/**
 * Mostra UI de chamada ativa
 */
function showCallUI(direction, type) {
  const modal = document.getElementById('whatsapp-call-modal');
  if (!modal) {
    createCallModal();
    return showCallUI(direction, type);
  }

  // Atualizar conteúdo
  const titleText = modal.querySelector('.modal-title-text') || modal.querySelector('.modal-title');
  if (titleText) {
    const typeText = type === CALL_TYPES.VIDEO ? 'Vídeo' : 'Voz';
    const dirText = direction === 'outgoing' ? 'Chamando...' : 'Chamada Recebida';
    titleText.textContent = `${typeText} - ${dirText}`;
  }

  // Mostrar modal
  const modalInstance = bootstrap.Modal.getOrCreateInstance(modal, { backdrop: true });
  modalInstance.show();
}

/**
 * Esconde UI de chamada
 */
function hideCallUI() {
  const modal = document.getElementById('whatsapp-call-modal');
  if (modal) {
    const modalInstance = bootstrap.Modal.getInstance(modal);
    if (modalInstance) {
      modalInstance.hide();
    }
  }
}

/**
 * Cria modal de chamada se não existir
 */
function createCallModal() {
  const modal = document.createElement('div');
  modal.id = 'whatsapp-call-modal';
  modal.className = 'modal fade';
  modal.setAttribute('tabindex', '-1');
  modal.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-centered">
      <div class="modal-content modal-shell">
        <div class="modal-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-1">
          <h2 class="modal-title mb-0">
            <i class="bi bi-telephone text-primary"></i>
            <span class="modal-title-text">Chamada WhatsApp</span>
          </h2>
          <button type="button" class="btn-close btn-close-modern" data-bs-dismiss="modal" aria-label="Fechar">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="modal-body text-center">
          <!-- Vídeos -->
          <div class="position-relative mb-3" style="min-height: 400px; background: #000; border-radius: 8px;">
            <video id="whatsapp-call-remote-video" autoplay playsinline class="w-100 h-100" style="object-fit: cover;"></video>
            <video id="whatsapp-call-local-video" autoplay playsinline muted class="position-absolute bottom-0 end-0 m-2" 
                   style="width: 150px; height: 112px; object-fit: cover; border-radius: 8px; border: 2px solid white;"></video>
          </div>

          <!-- Timer -->
          <div class="mb-3">
            <h4 id="whatsapp-call-timer" class="text-muted">00:00</h4>
          </div>

          <!-- Controles -->
          <div class="d-flex justify-content-center gap-2">
            <button id="whatsapp-call-mute-btn" class="btn btn-outline-secondary" title="Mute">
              <i class="bi bi-mic-fill"></i>
            </button>
            <button id="whatsapp-call-video-btn" class="btn btn-outline-secondary" title="Vídeo">
              <i class="bi bi-camera-video-fill"></i>
            </button>
            <button id="whatsapp-call-hold-btn" class="btn btn-outline-secondary" title="Hold">
              <i class="bi bi-pause-fill"></i>
            </button>
            <button id="whatsapp-call-end-btn" class="btn btn-danger" title="Desligar">
              <i class="bi bi-telephone-x-fill"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Bind eventos dos botões
  document.getElementById('whatsapp-call-mute-btn')?.addEventListener('click', toggleMute);
  document.getElementById('whatsapp-call-video-btn')?.addEventListener('click', toggleVideo);
  document.getElementById('whatsapp-call-hold-btn')?.addEventListener('click', toggleHold);
  document.getElementById('whatsapp-call-end-btn')?.addEventListener('click', () => endCall());

  // Atualizar stream local no vídeo
  if (callState.localStream) {
    const localVideo = document.getElementById('whatsapp-call-local-video');
    if (localVideo) {
      localVideo.srcObject = callState.localStream;
    }
  }
}

/**
 * Obtém histórico de chamadas
 */
export async function getCallHistory(chatId = null, limit = 50) {
  try {
    let query = db.collection('whatsappCalls');

    if (chatId) {
      query = query.where('chatId', '==', chatId);
    } else {
      const userId = auth.currentUser?.uid;
      if (userId) {
        query = query.where('callerId', '==', userId);
      }
    }

    const snapshot = await query
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

  } catch (err) {
    console.error('[whatsappCalls] Erro ao buscar histórico:', err);
    return [];
  }
}

// Exportar para uso global
window.__WHATSAPP_CALLS__ = {
  initCallSystem,
  startVoiceCall,
  startVideoCall,
  answerCall,
  rejectCall,
  endCall,
  toggleMute,
  toggleVideo,
  toggleHold,
  getCallHistory,
  CALL_STATUS,
  CALL_TYPES
};

export default {
  initCallSystem,
  startVoiceCall,
  startVideoCall,
  answerCall,
  rejectCall,
  endCall,
  toggleMute,
  toggleVideo,
  toggleHold,
  getCallHistory,
  CALL_STATUS,
  CALL_TYPES
};
