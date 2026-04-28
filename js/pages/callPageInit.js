import { db } from '../auth.js';

// ICE Servers (mesma config do whatsappCalls.js)
const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};

// Estado da chamada
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let callId = null;
let callStartTime = null;
let timerInterval = null;

// Elementos DOM
const waitingScreen = document.getElementById('waiting-screen');
const errorScreen = document.getElementById('error-screen');
const videoContainer = document.getElementById('video-container');
const callStatus = document.getElementById('call-status');
const callInfo = document.getElementById('call-info');
const callTimer = document.getElementById('call-timer');
const answerBtn = document.getElementById('answer-btn');
const muteBtn = document.getElementById('mute-btn');
const videoBtn = document.getElementById('video-btn');
const endBtn = document.getElementById('end-btn');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

// Pegar callId da URL
const urlParams = new URLSearchParams(window.location.search);
callId = urlParams.get('id');

if (!callId) {
  showError('ID de chamada inválido');
} else {
  initCall();
}

async function initCall() {
  try {
    // Buscar dados da chamada
    const callRef = db.collection('whatsappCalls').doc(callId);
    const callSnap = await callRef.get();

    if (!callSnap.exists) {
      showError('Chamada não encontrada');
      return;
    }

    const callData = callSnap.data();

    // Verificar se já foi atendida ou finalizada
    if (callData.status === 'connected' || callData.status === 'ended') {
      showError('Esta chamada já foi atendida ou finalizada');
      return;
    }

    // Mostrar botão de atender
    callInfo.textContent = `Tipo: ${callData.type === 'voice' ? 'Voz' : 'Vídeo'}`;
    answerBtn.style.display = 'block';
    answerBtn.onclick = () => answerCall(callData);

    // Auto-atender após 2s (UX melhor)
    setTimeout(() => answerCall(callData), 2000);
  } catch (err) {
    console.error('Erro ao inicializar chamada:', err);
    showError('Erro ao carregar chamada: ' + err.message);
  }
}

async function answerCall(callData) {
  try {
    answerBtn.disabled = true;
    callStatus.textContent = 'Solicitando permissões...';

    // Solicitar permissões de mídia
    const constraints = {
      audio: true,
      video: callData.type === 'video',
    };

    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;

    // Criar peer connection
    peerConnection = new RTCPeerConnection(ICE_SERVERS);

    // Adicionar tracks locais
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    // Receber tracks remotos
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

    peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };

    // ICE candidates
    peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        await db.collection('whatsappCalls').doc(callId).collection('iceCandidates').add({
          candidate: event.candidate.toJSON(),
          direction: 'incoming',
          createdAt: new Date(),
        });
      }
    };

    // Connection state
    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
      updateCallStatus(peerConnection.connectionState);
    };

    // Processar oferta SDP
    if (callData.offer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));

      // Criar resposta
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // Salvar resposta no Firestore
      const callRef = db.collection('whatsappCalls').doc(callId);
      await callRef.update({
        answer: {
          type: answer.type,
          sdp: answer.sdp,
        },
        status: 'connecting',
        answeredAt: new Date(),
      });

      // Ouvir ICE candidates do outro peer
      db.collection('whatsappCalls').doc(callId).collection('iceCandidates').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.direction === 'outgoing') {
              try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (err) {
                console.error('Erro ao adicionar ICE candidate:', err);
              }
            }
          }
        });
      });

      // Mostrar vídeos
      waitingScreen.style.display = 'none';
      videoContainer.style.display = 'block';
      callStatus.textContent = 'Conectando...';
      callStatus.className = 'call-status connecting';
    } else {
      showError('Oferta SDP não encontrada');
    }
  } catch (err) {
    console.error('Erro ao atender chamada:', err);
    showError('Erro ao atender: ' + err.message);
  }
}

function updateCallStatus(state) {
  switch (state) {
    case 'connected':
      callStatus.textContent = 'Conectado';
      callStatus.className = 'call-status connected';
      if (!callStartTime) {
        callStartTime = Date.now();
        startTimer();
      }
      break;
    case 'disconnected':
    case 'failed':
    case 'closed':
      callStatus.textContent = 'Desconectado';
      callStatus.className = 'call-status ended';
      stopTimer();
      endCall();
      break;
  }
}

function startTimer() {
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    callTimer.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Controles
muteBtn.onclick = () => {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      muteBtn.classList.toggle('active', !audioTrack.enabled);
      muteBtn.querySelector('i').className = audioTrack.enabled ? 'bi bi-mic-fill' : 'bi bi-mic-mute-fill';
    }
  }
};

videoBtn.onclick = () => {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      videoBtn.classList.toggle('active', !videoTrack.enabled);
      videoBtn.querySelector('i').className = videoTrack.enabled
        ? 'bi bi-camera-video-fill'
        : 'bi bi-camera-video-off-fill';
    }
  }
};

endBtn.onclick = endCall;

async function endCall() {
  try {
    // Fechar peer connection
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    // Parar streams
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }

    // Atualizar Firestore
    if (callId) {
      const callRef = db.collection('whatsappCalls').doc(callId);
      const duration = callStartTime ? Math.floor((Date.now() - callStartTime) / 1000) : 0;

      await callRef.update({
        status: 'ended',
        endedAt: new Date(),
        duration,
      });
    }

    stopTimer();

    // Fechar janela após 2s
    setTimeout(() => {
      window.close();
    }, 2000);
  } catch (err) {
    console.error('Erro ao finalizar chamada:', err);
  }
}

function showError(message) {
  waitingScreen.style.display = 'none';
  videoContainer.style.display = 'none';
  errorScreen.style.display = 'flex';
  document.getElementById('error-message').textContent = message;
}

// Cleanup ao fechar janela
window.addEventListener('beforeunload', endCall);
