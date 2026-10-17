import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export function mountLandingMotion() {
  const media = gsap.matchMedia();
  media.add("(prefers-reduced-motion: no-preference)", () => {
    const lenis = new Lenis({
      autoRaf: true,
      smoothWheel: true,
      lerp: 0.15,
      anchors: false,
      prevent: (node) =>
        node.closest("dialog") !== null || document.querySelector("dialog[open]") !== null,
    });
    lenis.on("scroll", ScrollTrigger.update);
    return () => lenis.destroy();
  });
  media.add(
    "(prefers-reduced-motion: no-preference) and (min-width: 56rem) and (min-height: 46rem)",
    () => {
      const stage = document.getElementById("hero-stage");
      if (!stage) return;
      const cards = stage.querySelectorAll<HTMLElement>("[data-hero-float]");
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: stage,
          start: "top 96px",
          end: "+=560",
          pin: true,
          pinSpacing: false,
          scrub: 0.6,
          invalidateOnRefresh: true,
        },
      });
      cards.forEach((card, index) => {
        timeline.fromTo(
          card,
          { x: index % 2 ? -48 : 48, y: 64, opacity: 0.25 },
          { x: 0, y: 0, opacity: 1, duration: 1, ease: "none" },
          index * 0.08,
        );
      });
    },
  );
  media.add("(prefers-reduced-motion: no-preference)", () => {
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
      gsap.fromTo(
        element,
        { y: 12, opacity: 0.75 },
        {
          y: 0,
          opacity: 1,
          duration: 0.28,
          ease: "power1.out",
          scrollTrigger: { trigger: element, start: "top 92%", once: true },
        },
      );
    });
  });
  const refresh = () => ScrollTrigger.refresh();
  document.fonts.ready.then(refresh);
  const device = document.querySelector(".hero-device");
  const deviceSize = new ResizeObserver(refresh);
  if (device) deviceSize.observe(device);
  document
    .querySelectorAll("details")
    .forEach((element) => element.addEventListener("toggle", refresh));
  window.addEventListener("orbit:language-changed", refresh);
  return () => {
    deviceSize.disconnect();
    media.revert();
    document
      .querySelectorAll("details")
      .forEach((element) => element.removeEventListener("toggle", refresh));
    window.removeEventListener("orbit:language-changed", refresh);
  };
}
