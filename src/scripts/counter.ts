const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.querySelectorAll<HTMLElement>(".count-up").forEach((element) => {
  const target = Number(element.dataset.countTarget ?? "0");
  if (prefersReducedMotion || !Number.isFinite(target) || target <= 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const duration = 1200;
        const step = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          element.textContent = String(Math.round(eased * target));
          if (progress < 1) requestAnimationFrame(step);
        };
        element.textContent = "0";
        requestAnimationFrame(step);
      });
    },
    { threshold: 0.5 },
  );
  observer.observe(element);
});

export {};
