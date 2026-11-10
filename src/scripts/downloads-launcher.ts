export {};

const openers = document.querySelectorAll<HTMLElement>('#downloads-toggle, a[href="#downloads"]');
/** The panel module binds its own listeners when it loads, so loading it removes every launcher listener. */
const launcher = new AbortController();
const loadPanel = () => {
  launcher.abort();
  return import("./downloads-panel");
};

for (const opener of openers)
  opener.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      void loadPanel().then(({ activate }) => activate(opener));
    },
    { signal: launcher.signal },
  );
if (location.hash === "#downloads") void loadPanel();
