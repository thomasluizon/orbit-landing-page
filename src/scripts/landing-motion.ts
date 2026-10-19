import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { updateHeroCarousel } from "./hero-carousel";
import { mountHeroFloat } from "./hero-float";
import { afterLoad } from "./task-queue";

gsap.registerPlugin(ScrollTrigger);

export function calendarWeekRange(
  totalWeeks: number,
  selectedWeek: number,
  measuredHeight: number,
  availableHeight: number,
  weekHeight: number,
) {
  const excess = Math.max(0, measuredHeight - availableHeight);
  const visibleWeeks = Math.max(1, totalWeeks - Math.ceil(excess / weekHeight));
  const start = Math.max(
    0,
    Math.min(selectedWeek - Math.floor(visibleWeeks / 2), totalWeeks - visibleWeeks),
  );
  return [start, start + visibleWeeks];
}

export function fitComposition(app: HTMLElement, viewportWidth: number, viewportHeight: number) {
  if (viewportWidth <= 0 || viewportHeight <= 0) return;
  app
    .querySelectorAll<HTMLElement>("[data-composition-folded]")
    .forEach((item) => item.removeAttribute("data-composition-folded"));
  const availableHeight = Math.floor(viewportHeight * 0.8);
  const grid = app.querySelector<HTMLElement>(".orbit-month-grid");
  if (grid) {
    const cells = [...grid.querySelectorAll<HTMLElement>("[data-calendar-week]")];
    const selected = grid.querySelector<HTMLElement>('[data-calendar-day][aria-pressed="true"]');
    const totalWeeks = Math.max(...cells.map((cell) => Number(cell.dataset.calendarWeek))) + 1;
    const weekHeight = cells[0]?.getBoundingClientRect().height ?? 0;
    if (weekHeight > 0) {
      const [start, end] = calendarWeekRange(
        totalWeeks,
        Number(selected?.dataset.calendarWeek ?? 0),
        app.getBoundingClientRect().height,
        availableHeight,
        weekHeight,
      );
      cells.forEach((cell) => {
        const week = Number(cell.dataset.calendarWeek);
        if (week < start || week >= end) cell.setAttribute("data-composition-folded", "");
      });
    }
  }
  for (const item of app.querySelectorAll<HTMLElement>("[data-composition-secondary]")) {
    if (app.getBoundingClientRect().height <= availableHeight) break;
    item.setAttribute("data-composition-folded", "");
  }
}

export function mountLandingMotion() {
  const fitCompositions = () => {
    document.querySelectorAll<HTMLElement>(".example-app").forEach((app) => {
      fitComposition(app, window.innerWidth, window.innerHeight);
    });
  };
  fitCompositions();
  const media = gsap.matchMedia();
  media.add("(prefers-reduced-motion: no-preference)", () => {
    const lenis = new Lenis({
      autoRaf: true,
      smoothWheel: true,
      lerp: 0.15,
      anchors: false,
      prevent: (node) => node.closest("#ios") !== null,
    });
    lenis.on("scroll", ScrollTrigger.update);
    return () => lenis.destroy();
  });
  media.add(
    {
      pinned: "(width > 640px) and (height >= 584px), (width <= 640px) and (height >= 568px)",
      flow: "(width > 640px) and (height < 584px), (width <= 640px) and (height < 568px)",
    },
    (context) => {
      const stage = document.getElementById("hero-stage");
      if (stage) {
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: stage,
            ...(context.conditions?.pinned
              ? {
                  start: () =>
                    `top ${(document.getElementById("site-header")?.getBoundingClientRect().bottom ?? 96) + 16}px`,
                  end: "+=560",
                  pin: true,
                  pinSpacing: false,
                }
              : { start: "top bottom", end: "bottom top", pin: false }),
            scrub: true,
            invalidateOnRefresh: true,
            onUpdate: (trigger) => updateHeroCarousel(trigger.progress),
            onRefresh: (trigger) => updateHeroCarousel(trigger.progress),
          },
        });
        timeline.to({}, { duration: 1 });
      }
    },
  );
  media.add("(prefers-reduced-motion: no-preference)", (context) => {
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
    const rows = document.querySelectorAll<HTMLElement>("[data-example-row]");
    const observer = rows.length
      ? new IntersectionObserver(
          (entries) => {
            void afterLoad(
              entries
                .filter((entry) => entry.isIntersecting)
                .map(({ target }) => {
                  observer?.unobserve(target);
                  return () => {
                    if (!active) return;
                    context.add(() =>
                      gsap.fromTo(
                        target.querySelectorAll("[data-composition-card]"),
                        { y: 48, opacity: 0.5 },
                        {
                          y: 0,
                          opacity: 1,
                          stagger: 0.12,
                          ease: "none",
                          scrollTrigger: {
                            trigger: target,
                            start: "top 90%",
                            end: "center 55%",
                            scrub: true,
                            invalidateOnRefresh: true,
                          },
                        },
                      ),
                    );
                  };
                }),
            );
          },
          { rootMargin: "160px" },
        )
      : undefined;
    let active = true;
    rows.forEach((row) => observer?.observe(row));
    return () => {
      active = false;
      observer?.disconnect();
      disposeFloat?.();
    };
  });
  const refresh = () => {
    fitCompositions();
    ScrollTrigger.refresh();
  };
  document.fonts.ready.then(refresh);
  const deviceSize = new ResizeObserver(refresh);
  const device = document.querySelector(".hero-device");
  if (device) deviceSize.observe(device);
  document.querySelectorAll(".example-card").forEach((card) => deviceSize.observe(card));
  document
    .querySelectorAll("details")
    .forEach((element) => element.addEventListener("toggle", refresh));
  window.addEventListener("resize", refresh);
  window.addEventListener("orbit:language-changed", refresh);
  window.addEventListener("orbit:layout-changed", refresh);
  return () => {
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
