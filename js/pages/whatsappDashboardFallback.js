// Fallback para garantir abertura via data-bs-toggle em ambientes onde a API do Bootstrap esteja indisponível
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-bs-toggle="modal"][data-bs-target]');
  if (!trigger) return;

  const selector = trigger.getAttribute('data-bs-target');
  if (!selector || selector === '#') return;

  const modal = document.querySelector(selector);
  if (!modal) {
    console.warn('[whatsapp-dashboard] Modal não encontrado para seletor', selector);
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (window.bootstrap?.Modal) {
    window.bootstrap.Modal.getOrCreateInstance(modal, { backdrop: true, focus: true }).show();
  } else {
    modal.classList.add('show');
    modal.style.display = 'block';
    document.body.classList.add('modal-open');
  }
});

// Fallback para botões data-bs-dismiss
document.addEventListener('click', (event) => {
  const dismissTrigger = event.target.closest('[data-bs-dismiss="modal"]');
  if (!dismissTrigger) return;

  const modal = dismissTrigger.closest('.modal');
  if (!modal) return;

  const hasInstance = Boolean(window.bootstrap?.Modal?.getInstance?.(modal));
  if (hasInstance) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  modal.classList.remove('show');
  modal.style.display = 'none';
  document.body.classList.remove('modal-open');
});
