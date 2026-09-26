// Minted — interações compartilhadas

// Menu mobile
const header = document.getElementById('header');
const menuBtn = document.getElementById('menuBtn');
if (menuBtn) {
  menuBtn.addEventListener('click', () => {
    const open = header.classList.toggle('is-open');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

// Sombra no header ao rolar
window.addEventListener('scroll', () => {
  header.classList.toggle('is-scrolled', window.scrollY > 8);
}, { passive: true });

// Reveal on scroll
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el));

// Formulário de orçamento → abre o WhatsApp com a mensagem montada
const quoteForm = document.getElementById('quoteForm');
if (quoteForm) {
  quoteForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = (id) => (document.getElementById(id)?.value || '').trim();

    const linhas = [
      'Olá! Gostaria de um orçamento com a Minted.',
      '',
      `Nome: ${v('fNome')}`,
      `Empresa: ${v('fEmpresa')}`,
      `E-mail: ${v('fEmail')}`,
      `Tipo de projeto: ${v('fTipo')}`,
      v('fQtd') ? `Quantidade estimada: ${v('fQtd')}` : '',
      v('fPrazo') ? `Prazo desejado: ${v('fPrazo')}` : '',
      '',
      `Detalhes: ${v('fMsg')}`
    ].filter((l) => l !== '');

    const url = 'https://wa.me/5500000000000?text=' + encodeURIComponent(linhas.join('\n'));
    window.open(url, '_blank', 'noopener');

    const ok = document.getElementById('formOk');
    if (ok) ok.hidden = false;
  });
}

// ---------------------------------------------------------------
// Compartilhar projeto (LinkedIn / Facebook)
// Por enquanto abre a janela de compartilhamento padrão da rede.
// TODO: trocar por post direto no feed via API (LinkedIn/Facebook)
//       quando a integração/autenticação estiver disponível.
// ---------------------------------------------------------------
document.querySelectorAll('.share-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const net = btn.dataset.share;
    const url = btn.dataset.url || window.location.href;
    const title = btn.dataset.title || document.title;
    const u = encodeURIComponent(url);
    const t = encodeURIComponent(title);

    const targets = {
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`
    };
    const share = targets[net];
    if (share) window.open(share, '_blank', 'noopener,width=640,height=580');
  });
});

// ---------------------------------------------------------------
// Marquee de clientes: duplica a lista uma vez para o loop ficar
// contínuo — assim você mantém só UMA lista no HTML.
// ---------------------------------------------------------------
document.querySelectorAll('[data-marquee]').forEach((track) => {
  track.innerHTML += track.innerHTML;
});

// ---------------------------------------------------------------
// Carrossel de projetos em destaque
// ---------------------------------------------------------------
const worksTrack = document.getElementById('worksTrack');
const worksPrev = document.getElementById('worksPrev');
const worksNext = document.getElementById('worksNext');
if (worksTrack && worksPrev && worksNext) {
  const step = () => {
    const card = worksTrack.querySelector('.work');
    const gap = parseFloat(getComputedStyle(worksTrack).columnGap) || 22;
    return card ? card.getBoundingClientRect().width + gap : 320;
  };
  const sync = () => {
    const max = worksTrack.scrollWidth - worksTrack.clientWidth - 2;
    worksPrev.disabled = worksTrack.scrollLeft <= 2;
    worksNext.disabled = worksTrack.scrollLeft >= max;
  };
  worksPrev.addEventListener('click', () => worksTrack.scrollBy({ left: -step(), behavior: 'smooth' }));
  worksNext.addEventListener('click', () => worksTrack.scrollBy({ left: step(), behavior: 'smooth' }));
  worksTrack.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();
}
