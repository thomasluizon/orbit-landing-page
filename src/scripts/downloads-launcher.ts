export {};

const openers = document.querySelectorAll<HTMLElement>('#downloads-toggle, a[href="#downloads"]');
const loadPanel = () => import("./downloads-panel");

for (const opener of openers)
  opener.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      void loadPanel().then(() => opener.click());
    },
    { once: true },
  );
if (location.hash === "#downloads") void loadPanel();
