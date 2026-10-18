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
      prevent: (node) => node.closest(".phone-carousel, #ios") !== null,
    });
    lenis.on("scroll", ScrollTrigger.update);
    return () => lenis.destroy();
  });
  media.add("(prefers-reduced-motion: no-preference)", () => {
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
          scrub: 0.6,
          invalidateOnRefresh: true,
        },
      });
      stage.querySelectorAll<HTMLElement>("[data-hero-column]").forEach((column, index) => {
        timeline.fromTo(
          column.querySelectorAll("[data-hero-float]"),
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 1, ease: "none", stagger: 0.18 },
          index * 0.08,
        );
      });
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
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        },
      );
    });
  });
  const refresh = () => ScrollTrigger.refresh();
  document.fonts.ready.then(refresh);
  const deviceSize = new ResizeObserver(refresh);
  const device = document.querySelector(".hero-device");
  if (device) deviceSize.observe(device);
  document
    .querySelectorAll("details")
    .forEach((element) => element.addEventListener("toggle", refresh));
  window.addEventListener("orbit:language-changed", refresh);
  window.addEventListener("orbit:layout-changed", refresh);
  return () => {
    deviceSize.disconnect();
    media.revert();
    document
      .querySelectorAll("details")
      .forEach((element) => element.removeEventListener("toggle", refresh));
    window.removeEventListener("orbit:language-changed", refresh);
    window.removeEventListener("orbit:layout-changed", refresh);
  };
}
