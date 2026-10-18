import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { updateHeroCarousel } from "./hero-carousel";
import { mountHeroFloat } from "./hero-float";

gsap.registerPlugin(ScrollTrigger);

export function mountLandingMotion() {
  const media = gsap.matchMedia();
  media.add("(prefers-reduced-motion: no-preference)", () => {
    const lenis = new Lenis({
      autoRaf: true,
      smoothWheel: true,
      lerp: 0.15,
      anchors: false,
      prevent: (node) => node.closest(".phone-carousel, #ios") !== null,
    });
    lenis.on("scroll", ScrollTrigger.update);
    return () => lenis.destroy();
  });
  media.add("all", () => {
    const stage = document.getElementById("hero-stage");
    if (stage) {
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: stage,
          start: () =>
            `top ${(document.getElementById("site-header")?.getBoundingClientRect().bottom ?? 96) + 16}px`,
          end: "+=560",
          pin: true,
          pinSpacing: false,
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (trigger) => updateHeroCarousel(trigger.progress),
          onRefresh: (trigger) => updateHeroCarousel(trigger.progress),
        },
      });
      timeline.to({}, { duration: 1 });
    }
  });
  media.add("(prefers-reduced-motion: no-preference)", () => {
    const stage = document.getElementById("hero-stage");
    const disposeFloat = stage ? mountHeroFloat(stage) : undefined;
    if (stage) {
      gsap.fromTo(
        stage.querySelectorAll("[data-hero-float] > *"),
        { y: 24, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          stagger: 0.12,
          ease: "none",
          scrollTrigger: {
            trigger: stage,
            start: "top 85%",
            end: "top 20%",
            scrub: true,
            invalidateOnRefresh: true,
          },
        },
      );
    }
    document.querySelectorAll<HTMLElement>("[data-example-row]").forEach((row) => {
      gsap.fromTo(
        row.querySelectorAll("[data-composition-card]"),
        { y: 48, scale: 0.94, opacity: 0.5 },
        {
          y: 0,
          scale: 1,
          opacity: 1,
          stagger: 0.12,
          ease: "none",
          scrollTrigger: {
            trigger: row,
            start: "top 90%",
            end: "center 55%",
            scrub: true,
            invalidateOnRefresh: true,
          },
        },
      );
    });
    return () => disposeFloat?.();
  });
  const compositions = [...document.querySelectorAll<HTMLElement>(".example-card")];
  const fitCompositions = () => {
    compositions.forEach((card) => {
      const app = card.querySelector<HTMLElement>(".example-app");
      if (!app) return;
      const height = app.offsetHeight;
      const scale =
        window.innerWidth >= 768 && height > 0
          ? Math.min(1, (window.innerHeight * 0.8) / height)
          : 1;
      card.style.setProperty("--composition-scale", String(scale));
      card.style.setProperty("--composition-height", `${height * scale}px`);
    });
  };
  const compositionSize = new ResizeObserver(fitCompositions);
  compositions.forEach((card) => {
    const app = card.querySelector(".example-app");
    if (app) compositionSize.observe(app);
  });
  const refresh = () => {
    fitCompositions();
    ScrollTrigger.refresh();
  };
  document.fonts.ready.then(refresh);
  const deviceSize = new ResizeObserver(refresh);
  const device = document.querySelector(".hero-device");
  if (device) deviceSize.observe(device);
  document
    .querySelectorAll("details")
    .forEach((element) => element.addEventListener("toggle", refresh));
  window.addEventListener("resize", refresh);
  window.addEventListener("orbit:language-changed", refresh);
  window.addEventListener("orbit:layout-changed", refresh);
  return () => {
    compositionSize.disconnect();
    compositions.forEach((card) => {
      card.style.removeProperty("--composition-scale");
      card.style.removeProperty("--composition-height");
    });
    deviceSize.disconnect();
    media.revert();
    document
      .querySelectorAll("details")
      .forEach((element) => element.removeEventListener("toggle", refresh));
    window.removeEventListener("resize", refresh);
    window.removeEventListener("orbit:language-changed", refresh);
    window.removeEventListener("orbit:layout-changed", refresh);
  };
}
