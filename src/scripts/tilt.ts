const supportsFinePointer = window.matchMedia("(pointer: fine)").matches;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (supportsFinePointer && !prefersReducedMotion) {
  document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((element) => {
    let frame = 0;
    element.addEventListener("mousemove", (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const ratioX = (event.clientX - rect.left) / rect.width - 0.5;
        const ratioY = (event.clientY - rect.top) / rect.height - 0.5;
        element.style.transform = `perspective(900px) rotateX(${(-ratioY * 7).toFixed(2)}deg) rotateY(${(ratioX * 7).toFixed(2)}deg)`;
      });
    });
    element.addEventListener("mouseleave", () => {
      cancelAnimationFrame(frame);
      element.style.transform = "";
    });
  });
}

export {};
