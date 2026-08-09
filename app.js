const reveals = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
reveals.forEach((el, index) => {
  el.style.transitionDelay = `${Math.min(index % 3, 2) * 90}ms`;
  observer.observe(el);
});

const menu = document.querySelector('.menu');
const nav = document.querySelector('.topbar nav');
menu.addEventListener('click', () => {
  const open = menu.classList.toggle('active');
  nav.classList.toggle('open', open);
  menu.setAttribute('aria-expanded', String(open));
});
nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  menu.classList.remove('active');
  nav.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
}));

window.addEventListener('pointermove', (event) => {
  document.documentElement.style.setProperty('--mx', `${event.clientX}px`);
  document.documentElement.style.setProperty('--my', `${event.clientY}px`);
}, { passive: true });
