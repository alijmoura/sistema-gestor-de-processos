# 🔊 Sons do Sistema

Esta pasta contém os arquivos de som para notificações do sistema (geral e WhatsApp).

## Arquivos de Sons Gerais (Sistema)

### Sons de Notificação Push (Geral)
1. **notification.mp3** - Som genérico de notificação
2. **success.mp3** - Som de sucesso/confirmação
3. **info.mp3** - Som de informação
4. **error.mp3** - Som de erro/alerta

### Sons de WhatsApp
5. **message.mp3** - Som para novas mensagens (recomendado: curto, sutil)
6. **new-chat.mp3** - Som para novo chat na fila (recomendado: mais chamativo)
7. **assigned.mp3** - Som quando um chat é atribuído ao agente
8. **transfer.mp3** - Som de transferência de chat
9. **mention.mp3** - Som quando o agente é mencionado
10. **warning.mp3** - Som de alerta de SLA ou avisos importantes

## Status Atual

✅ **Disponíveis:** message.mp3, new-chat.mp3, assigned.mp3, transfer.mp3, mention.mp3, warning.mp3
⚠️ **Placeholders (substituir):** notification.mp3, success.mp3, info.mp3, error.mp3

## Onde Encontrar Sons Gratuitos

### Opções Recomendadas:

1. **Zapsplat** - https://www.zapsplat.com/
   - Categoria: UI/Notification Sounds
   - Formato: MP3
   - Licença: Gratuita com atribuição

2. **Freesound** - https://freesound.org/
   - Buscar por: "notification", "message", "alert"
   - Filtrar por: MP3, Creative Commons
   - Licença: Verificar para cada som

3. **Notification Sounds** - https://notificationsounds.com/
   - Sons prontos para notificações
   - Download direto em MP3

4. **Mixkit** - https://mixkit.co/free-sound-effects/notification/
   - Sons gratuitos de alta qualidade
   - Sem necessidade de atribuição

## Especificações Técnicas

- **Formato**: MP3
- **Duração**: 1-3 segundos (notificações curtas)
- **Qualidade**: 128-192 kbps (suficiente)
- **Volume**: Normalizado (não muito alto)

## Exemplo de Configuração

```javascript
// Em whatsappNotifications.js
const NOTIFICATION_SOUNDS = {
  NEW_MESSAGE: '/sounds/message.mp3',
  NEW_CHAT: '/sounds/new-chat.mp3',
  CHAT_ASSIGNED: '/sounds/assigned.mp3',
  CHAT_TRANSFERRED: '/sounds/transfer.mp3',
  MENTION: '/sounds/mention.mp3',
  SLA_WARNING: '/sounds/warning.mp3'
};
```

## Testes

Após adicionar os arquivos, teste cada som:

```javascript
// No console do navegador
const audio = new Audio('/sounds/message.mp3');
audio.play();
```

## Fallback

Se os sons não estiverem disponíveis, o sistema continuará funcionando normalmente, apenas sem áudio.

---

**Nota**: Certifique-se de que os arquivos estão acessíveis publicamente (não bloqueados por regras do servidor).
