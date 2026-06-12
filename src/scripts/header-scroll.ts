const header = document.getElementById("site-header");

if (header) {
  const updateHeaderState = () => {
    header.classList.toggle("scrolled", window.scrollY > 20);
  };
  window.addEventListener("scroll", () => requestAnimationFrame(updateHeaderState), {
    passive: true,
  });
  updateHeaderState();
}
