const amplitude = 17;
const timeScale = 0.82;
const strength = 50;
const parallaxScale = 0.22;
const lerp = 0.14;

type FloatPath = 0 | 1 | 2;

function floatOffset(path: FloatPath, seconds: number, phase: number) {
  const t = seconds * timeScale;
  if (path === 1) {
    return {
      x: Math.sin(t + phase) * amplitude,
      y: Math.sin(2 * (t + phase)) * amplitude * 0.48,
    };
  }
  if (path === 2) {
    return {
      x: amplitude * (0.58 * Math.sin(0.62 * t + phase) + 0.42 * Math.sin(1.73 * t + 1.3 * phase)),
      y:
        amplitude *
        (0.58 * Math.cos(0.81 * t + 0.9 * phase) + 0.42 * Math.cos(1.51 * t + 1.1 * phase)),
    };
  }
  return { x: Math.cos(t + phase) * amplitude, y: Math.sin(t + phase) * amplitude };
}

function mountCardPointer(element: HTMLElement, canMove: () => boolean) {
  const reset = () => {
    element.style.removeProperty("translate");
    element.style.removeProperty("rotate");
  };
  const follow = (event: PointerEvent) => {
    if (!canMove() || event.pointerType !== "mouse") return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    element.style.translate = `${(x * 3).toFixed(2)}px ${(y * 3).toFixed(2)}px`;
    const tilt = Math.hypot(x, y);
    element.style.rotate = `${tilt ? -y : 1} ${x} 0 ${(tilt * 2).toFixed(2)}deg`;
  };
  element.addEventListener("pointerenter", follow);
  element.addEventListener("pointermove", follow);
  element.addEventListener("pointerleave", reset);
  element.addEventListener("pointercancel", reset);
  return {
    reset,
    dispose() {
      element.removeEventListener("pointerenter", follow);
      element.removeEventListener("pointermove", follow);
      element.removeEventListener("pointerleave", reset);
      element.removeEventListener("pointercancel", reset);
      reset();
    },
  };
}

export function mountHeroFloat(stage: HTMLElement) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const desktop = window.matchMedia("(min-width: 768px)");
  const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const columns = [...stage.querySelectorAll<HTMLElement>("[data-hero-column]")].map(
    (element, columnIndex) => ({
      element,
      direction: columnIndex % 2 === 0 ? 1 : -1,
      offset: 0,
      cards: [...element.querySelectorAll<HTMLElement>("[data-hero-float]")].map((card, index) => ({
        element: card,
        path: ((index + columnIndex) % 3) as FloatPath,
        phase: Math.random() * Math.PI * 2,
      })),
    }),
  );
  const pointerMotion = columns.flatMap((column) =>
    column.cards.map((card) => mountCardPointer(card.element, () => canRun() && pointer.matches)),
  );
  let frame = 0;
  let visible = false;

  function canRun() {
    return visible && !document.hidden && !reduced.matches && desktop.matches;
  }

  function tick(timestamp: number) {
    frame = 0;
    if (!canRun()) return;
    const halfViewport = window.innerHeight / 2 || 1;
    const positions = columns.map((column) => {
      const rect = column.element.getBoundingClientRect();
      const n = Math.max(
        -1,
        Math.min(1, (halfViewport - rect.top - rect.height / 2) / halfViewport),
      );
      const target = n * strength * parallaxScale * column.direction;
      column.offset += (target - column.offset) * lerp;
      return (column.offset / 100) * rect.height;
    });
    columns.forEach((column, index) => {
      column.cards.forEach((card) => {
        const { x, y } = floatOffset(card.path, timestamp / 1000, card.phase);
        card.element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate3d(0px, ${positions[index].toFixed(2)}px, 0)`;
      });
    });
    frame = requestAnimationFrame(tick);
  }

  function updateLoop() {
    if (!canRun() || !pointer.matches) pointerMotion.forEach((motion) => motion.reset());
    if (canRun()) {
      if (!frame) frame = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      if (reduced.matches || !desktop.matches) {
        columns.forEach((column) => {
          column.offset = 0;
          column.cards.forEach((card) => card.element.style.removeProperty("transform"));
        });
      }
    }
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updateLoop();
  });
  observer.observe(stage);
  document.addEventListener("visibilitychange", updateLoop);
  reduced.addEventListener("change", updateLoop);
  desktop.addEventListener("change", updateLoop);
  pointer.addEventListener("change", updateLoop);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    document.removeEventListener("visibilitychange", updateLoop);
    reduced.removeEventListener("change", updateLoop);
    desktop.removeEventListener("change", updateLoop);
    pointer.removeEventListener("change", updateLoop);
    pointerMotion.forEach((motion) => motion.dispose());
    columns.forEach((column) =>
      column.cards.forEach((card) => card.element.style.removeProperty("transform")),
    );
  };
}
