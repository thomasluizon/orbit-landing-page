const screen = document.querySelector<HTMLElement>(".device-screen");
const layout = screen?.querySelector<HTMLElement>(".phone-screen");

if (screen && layout) {
  const fit = (width: number) => {
    if (width <= 0) return;
    screen.style.setProperty("--phone-scale", String(Math.min(1, width / layout.offsetWidth)));
  };
  fit(screen.getBoundingClientRect().width);
  new ResizeObserver(([entry]) => fit(entry.contentRect.width)).observe(screen);
}

export {};
