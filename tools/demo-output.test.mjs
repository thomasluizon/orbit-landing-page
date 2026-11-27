import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { parse } from "@astrojs/compiler";

const source = readFileSync("dist/index.html", "utf8");
const { ast } = await parse(source);
const descendants = (node) => [node, ...(node.children ?? []).flatMap(descendants)];
const nodes = descendants(ast);
const attributes = (node) =>
  Object.fromEntries((node.attributes ?? []).map(({ name, value }) => [name, value]));
function harness(language = "en", threadHeight = 415) {
  const events = new Map();
  const observers = [];
  const watchers = [];
  const elements = new Map();
  function element(node, parent = null) {
    const attrs = attributes(node);
    let text = node.type === "text" ? node.value : "";
    const result = {
      name: node.name,
      parent,
      hidden: Object.hasOwn(attrs, "hidden"),
      attributes: { ...attrs },
      listeners: new Map(),
      dataset: Object.fromEntries(
        Object.entries(attrs)
          .filter(([name]) => name.startsWith("data-"))
          .map(([name, value]) => [
            name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
            value,
          ]),
      ),
      value: "",
      focused: false,
      get textContent() {
        return text + this.children.map((child) => child.textContent).join("");
      },
      set textContent(value) {
        text = value;
        this.children = [];
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      get classList() {
        const classes = () => new Set((this.attributes.class ?? "").split(/\s+/).filter(Boolean));
        return {
          contains: (name) => classes().has(name),
          toggle: (name, on) => {
            const values = classes();
            if (on) values.add(name);
            else values.delete(name);
            this.attributes.class = [...values].join(" ");
            return on;
          },
        };
      },
      getAttribute(name) {
        return this.attributes[name];
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
      toggleAttribute(name, on) {
        if (name === "hidden") this.hidden = on;
        if (on) this.attributes[name] = "";
        else delete this.attributes[name];
      },
      addEventListener(name, fn) {
        this.listeners.set(name, fn);
      },
      focus() {
        this.focused = true;
      },
      scrollIntoView() {},
      hasAttribute(name) {
        return Object.hasOwn(this.attributes, name);
      },
      matches(selector) {
        if (selector === "a[data-app-entry]")
          return this.name === "a" && this.hasAttribute("data-app-entry");
        for (const [, excluded] of selector.matchAll(/:not\(([^)]+)\)/g)) {
          if (this.matches(excluded)) return false;
        }
        const simple = selector.replace(/:not\([^)]+\)/g, "");
        if (simple.startsWith("."))
          return (this.attributes.class ?? "").split(/\s+/).includes(simple.slice(1));
        const [, name, value] = simple.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/) ?? [];
        return (
          name !== undefined &&
          Object.hasOwn(this.attributes, name) &&
          (value === undefined || this.attributes[name] === value)
        );
      },
      querySelectorAll(selector) {
        return this.children.flatMap((child) =>
          descendants(child).filter((candidate) => candidate.matches(selector)),
        );
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null;
      },
      closest(selector) {
        return this.matches(selector) ? this : (this.parent?.closest(selector) ?? null);
      },
      fire(event) {
        this.listeners.get(event)?.({ preventDefault() {} });
      },
    };
    result.children = (node.children ?? []).map((child) => element(child, result));
    if (attrs.id) elements.set(attrs.id, result);
    return result;
  }
  const document = element(ast);
  document.getElementById = (id) => elements.get(id) ?? null;
  const chips = elements.get("orbit-demo").querySelectorAll("[data-demo]");
  const exchange = elements.get("orbit-demo").querySelector(".demo-exchange");
  const thread = elements.get("demo-preview").closest(".demo-thread");
  thread.clientHeight = threadHeight;
  thread.scrollHeight = threadHeight;
  let scrollTop = 0;
  Object.defineProperty(thread, "scrollTop", {
    get: () => scrollTop,
    set(value) {
      scrollTop = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight));
    },
  });
  const intents = [];
  const context = vm.createContext({
    URL,
    environment: {
      PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
      PUBLIC_ANDROID_INSTALL_URL: process.env.PUBLIC_ANDROID_INSTALL_URL,
    },
    navigator: { userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/140.0" },
    Element: class {
      static [Symbol.hasInstance](value) {
        return Boolean(value?.attributes);
      }
    },
    ResizeObserver: class {
      targets = new Set();
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target) {
        this.targets.add(target);
      }
    },
    IntersectionObserver: class {
      targets = new Set();
      constructor(callback, options = {}) {
        this.callback = callback;
        this.options = options;
        watchers.push(this);
      }
      observe(target) {
        this.targets.add(target);
      }
      unobserve(target) {
        this.targets.delete(target);
      }
    },
    exports: {},
    document,
    requestAnimationFrame: (callback) => callback(),
    window: {
      addEventListener: (name, fn) => events.set(name, fn),
      location: { assign: (value) => intents.push(value) },
    },
  });
  const modules = new Map();
  function require(path) {
    if (path === "./i18n") return { getLang: () => language };
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(
      readFileSync(`src/scripts/${path}.ts`, "utf8").replaceAll("import.meta.env", "environment"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      },
    ).outputText;
    const exports = {};
    vm.runInContext(`(function(exports,require){${code}\n})`, context)(exports, require);
    modules.set(path, exports);
    return exports;
  }
  const translations = require("../i18n/translations").translations;
  function translate() {
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = translations[language][element.attributes["data-i18n"]];
    });
    document.querySelectorAll("[data-copy-en]").forEach((element) => {
      element.textContent = language === "en" ? element.dataset.copyEn : element.dataset.copyPt;
    });
  }
  translate();
  require("./demo");
  require("./app-entry");
  return {
    document,
    elements,
    intents,
    enter() {
      const event = {
        target: elements.get("demo-continue-link"),
        isTrusted: true,
        button: 0,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
      };
      document.listeners.get("click")(event);
      return event;
    },
    chips,
    phoneRows: () => elements.get("phone-today").querySelectorAll("[data-habit-toggle]"),
    visibleRows: () =>
      elements
        .get("phone-today")
        .querySelectorAll("[data-habit-toggle]")
        .filter((row) => !row.hidden),
    events,
    exchange,
    thread,
    observers,
    arrive(target) {
      for (const watcher of watchers) {
        if (watcher.targets.has(target)) watcher.callback([{ target, isIntersecting: true }]);
      }
    },
    watched: () => watchers.flatMap((watcher) => [...watcher.targets]),
    watchers: () => watchers,
    load: (path) => require(path),
    resize(target) {
      for (const observer of observers) {
        if (observer.targets.has(target)) observer.callback();
      }
    },
    get: (id) => elements.get(id),
    strings: translations[language],
    landing: require("../i18n/translations").landingCopy[language],
    switchLanguage(value) {
      language = value;
      translate();
      events.get("orbit:language-changed")();
    },
  };
}

test("every habit toggle sits in a phone, whose demo binds it", () => {
  const isToggle = (node) => Object.hasOwn(attributes(node), "data-habit-toggle");
  const phones = nodes.filter((node) =>
    (attributes(node).class ?? "")
      .split(/\s+/)
      .some((name) => name === "hero-device" || name === "feature-phone"),
  );
  assert.equal(phones.length, 2);
  const toggles = nodes.filter(isToggle);
  assert.ok(toggles.length > 0);
  assert.equal(
    phones.flatMap((phone) => descendants(phone).filter(isToggle)).length,
    toggles.length,
  );
});

test("the hero copy of the demo has no id, no app entry and no focus stop", () => {
  const phone = nodes.find((node) =>
    (attributes(node).class ?? "").split(/\s+/).includes("hero-device"),
  );
  const copy = descendants(phone).find((node) => attributes(node).class === "inert-copy");
  assert.ok(copy && Object.hasOwn(attributes(copy), "inert"));
  for (const node of descendants(copy)) {
    const own = attributes(node);
    assert.equal(own.id, undefined);
    assert.equal(own.for, undefined);
    assert.equal(Object.hasOwn(own, "data-app-entry"), false);
    assert.equal(Object.hasOwn(own, "data-demo"), false);
  }
});

test("each demo id appears once in the built page", () => {
  const ids = nodes.map((node) => attributes(node).id).filter(Boolean);
  const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicated, []);
});

test("a guide Orbit blinks once when it arrives and never before", () => {
  const h = harness("en");
  const guides = nodes.filter((node) => "data-orbit-guide" in attributes(node));
  assert.ok(
    guides.length >= (process.env.PUBLIC_IOS_APP_STORE_URL ? 4 : 5),
    "the hero and each section guide an Orbit",
  );
  assert.equal(h.watched().length, 0, "the demo module leaves the guides alone");
  h.load("./guide-blink");
  const watched = h.watched();
  assert.equal(watched.length, guides.length, "each guide waits for its arrival");
  for (const guide of watched) {
    assert.equal(guide.dataset.orbitBlink, undefined, "no guide blinks before it arrives");
  }
  const [first, ...rest] = watched;
  h.arrive(first);
  assert.equal(first.dataset.orbitBlink, "", "the arriving guide starts its blink");
  for (const guide of rest) assert.equal(guide.dataset.orbitBlink, undefined);
  assert.ok(!h.watched().includes(first), "a guide blinks once and is not watched again");
});

test("the guide blink waits until the arrival has made the guide visible", () => {
  const h = harness("en");
  h.load("./guide-blink");
  const [watcher] = h.watchers().filter((entry) => entry.targets.size > 0);
  assert.equal(
    watcher.options.rootMargin,
    "0px 0px -25% 0px",
    "the band keeps the bottom quarter of the viewport out, where the arrival still holds the guide transparent",
  );
  assert.equal(watcher.options.threshold, 0.6);
});

test("exchange growth retains the reveal observer without scrolling the phone or page", () => {
  for (const language of ["en", "pt-BR"]) {
    const h = harness(language, 600);
    const observed = h.observers.flatMap((observer) => [...observer.targets]);
    assert.ok(observed.includes(h.get("demo-preview")));
    assert.ok(observed.includes(h.thread));
    assert.ok(observed.includes(h.exchange), "request and reply growth must trigger reveal");
    h.thread.scrollHeight = 940;
    h.thread.scrollTop = 200;
    h.resize(h.exchange);
    assert.equal(h.thread.scrollTop, 0);
    h.get("demo-edit").fire("click");
    h.resize(h.exchange);
    assert.equal(h.get("demo-edit-name").focused, true);
    assert.equal(h.thread.scrollTop, 0);
  }
  assert.doesNotMatch(readFileSync("src/scripts/demo.ts", "utf8"), /scrollIntoView/);
});

for (const language of ["en", "pt-BR"]) {
  test(`${language}: typed requests stay local, can be edited, and approve into Today with a supported app title`, () => {
    const h = harness(language);
    h.get("demo-input").value =
      language === "en" ? "I want to read at night." : "Quero ler à noite.";
    h.get("demo-composer").fire("submit");
    assert.equal(
      h.get("demo-request").textContent,
      language === "en" ? "I want to read at night." : "Quero ler à noite.",
    );
    assert.equal(
      h.get("demo-habit").textContent,
      language === "en" ? "read at night" : "ler à noite",
    );
    assert.equal(h.get("demo-repeat").textContent, h.strings["demo.start.alternateRepeat"]);
    assert.equal(h.get("demo-continue").hidden, true);
    h.get("demo-edit").fire("click");
    assert.equal(h.get("demo-edit-form").hidden, false);
    h.get("demo-edit-name").value = "Read & reflect";
    h.get("demo-edit-schedule").value = "afternoon";
    h.get("demo-edit-form").fire("submit");
    assert.equal(h.get("demo-habit").textContent, "Read & reflect");
    assert.equal(h.get("demo-repeat").textContent, h.strings["demo.afternoon"]);
    h.get("demo-approve").fire("click");
    assert.equal(h.get("demo-preview").hidden, true);
    assert.equal(h.get("demo-today").hidden, false);
    assert.equal(h.get("demo-today-habit").textContent, "Read & reflect");
    assert.equal(h.get("demo-today-repeat").textContent, h.strings["demo.afternoon"]);
    const rows = h.visibleRows();
    assert.deepEqual(
      rows.map((row) => row.querySelector(".habit-name").textContent.trim()),
      ["product.stretch", "product.walk", "product.read", "product.run"]
        .map((key) => h.landing[key])
        .concat("Read & reflect"),
    );
    assert.equal(
      rows.at(-1).querySelector(".product-caption").textContent.trim(),
      h.strings["demo.afternoon"],
    );
    assert.equal(rows.at(-1).attributes["aria-pressed"], "false");
    const link = new URL(h.get("demo-continue-link").href);
    assert.equal(link.origin, new URL(h.get("demo-continue-link").dataset.appUrl).origin);
    assert.equal(link.pathname, "/habits/new");
    assert.deepEqual([...link.searchParams], [["title", "Read & reflect"]]);
    assert.equal(h.get("demo-continue").hidden, false);
    const otherLanguage = language === "en" ? "pt-BR" : "en";
    h.switchLanguage(otherLanguage);
    const translated = harness(otherLanguage).strings;
    assert.equal(rows.at(-1).querySelector(".habit-name").textContent, "Read & reflect");
    assert.equal(
      rows.at(-1).querySelector(".product-caption").textContent,
      translated["demo.afternoon"],
    );
    assert.doesNotMatch(
      readFileSync("src/scripts/demo.ts", "utf8"),
      /fetch\(|innerHTML|setTimeout/,
    );
  });
  test(`${language}: examples propose the selected habits and rejection adds nothing`, () => {
    const h = harness(language);
    const originalRows = h.visibleRows();
    for (const [index, name] of ["start", "restart", "move"].entries()) {
      h.chips[index].fire("click");
      assert.equal(h.get("demo-request").textContent, h.strings[`demo.${name}.request`]);
      assert.equal(h.get("demo-second").hidden, name !== "move");
      h.get("demo-reject").fire("click");
      assert.equal(h.get("demo-result").textContent, h.strings["demo.rejected"]);
      assert.equal(h.get("demo-today").hidden, true);
      assert.deepEqual(h.visibleRows(), originalRows);
      assert.equal(h.get("demo-continue").hidden, true);
    }
  });
  test(`${language}: each demo step turns the hero Orbit once and the page load starts none`, () => {
    const h = harness(language);
    const orbit = h.document.querySelector(".hero-copy").querySelector("[data-orbit-mascot]");
    assert.ok(orbit, "the hero holds the live Orbit");
    assert.equal(orbit.dataset.orbitTurn, undefined);
    h.chips[1].fire("click");
    assert.equal(orbit.dataset.orbitTurn, "run");
    orbit.dataset.orbitTurn = "done";
    h.get("demo-approve").fire("click");
    assert.equal(orbit.dataset.orbitTurn, "run");
    orbit.onanimationend({ animationName: "orbit-spin", currentTarget: orbit });
    assert.equal(orbit.dataset.orbitTurn, "done");
  });
  test(`${language}: single approvals replace the matching habit and retain the other rows in order`, () => {
    const h = harness(language);
    const samples = h.visibleRows();
    assert.equal(samples.length, 5);
    for (const index of [0, 1]) {
      const example = index === 0 ? "start" : "restart";
      h.chips[index].fire("click");
      h.get("demo-approve").fire("click");
      const rows = h.visibleRows();
      const title = h.strings[`demo.${example}.habit`];
      assert.deepEqual(
        rows.slice(0, -1),
        samples.filter((row) => row.querySelector(".habit-name").textContent.trim() !== title),
      );
      assert.equal(
        rows.at(-1).querySelector(".habit-name").textContent.trim(),
        h.strings[`demo.${example}.habit`],
      );
      assert.equal(
        rows.at(-1).querySelector(".product-caption").textContent.trim(),
        h.strings[`demo.${example}.repeat`],
      );
      assert.equal(rows.at(-1).attributes.class, samples[0].attributes.class);
      assert.ok(rows.at(-1).querySelector(".habit-emoji"));
      assert.ok(rows.at(-1).querySelector(".status-ring"));
    }
  });
  test(`${language}: edited batches replace all samples and resets reuse the approved rows`, () => {
    const h = harness(language);
    const samples = h.visibleRows();
    h.chips[2].fire("click");
    h.get("demo-edit").fire("click");
    h.get("demo-edit-name").value = "Evening walk";
    h.get("demo-edit-schedule").value = "evening";
    h.get("demo-edit-form").fire("submit");
    h.get("demo-approve").fire("click");
    const approved = h.visibleRows();
    assert.deepEqual(
      approved.map((row) => row.querySelector(".habit-name").textContent.trim()),
      ["Evening walk", h.strings["demo.move.secondHabit"]],
    );
    assert.ok(samples.every((row) => row.hidden));
    for (const row of approved) {
      assert.equal(
        row.querySelector(".product-caption").textContent.trim(),
        h.strings["demo.start.alternateRepeat"],
      );
    }
    const count = h.phoneRows().length;
    h.chips[0].fire("click");
    h.get("demo-reject").fire("click");
    assert.deepEqual(h.visibleRows(), approved, "rejecting retains the accepted batch");
    h.chips[2].fire("click");
    h.get("demo-approve").fire("click");
    assert.deepEqual(h.visibleRows(), approved, "approving again reuses both rows");
    assert.equal(h.phoneRows().length, count);
    assert.equal(
      approved[0].querySelector(".habit-name").textContent.trim(),
      h.strings["demo.move.habit"],
    );
    h.chips[0].fire("click");
    h.get("demo-approve").fire("click");
    assert.deepEqual(h.visibleRows(), [
      ...samples.filter(
        (row) =>
          row.querySelector(".habit-name").textContent.trim() !== h.strings["demo.start.habit"],
      ),
      approved[0],
    ]);
    assert.equal(approved[1].hidden, true);
    assert.equal(h.phoneRows().length, count);
  });
}
test("empty submissions keep the current proposal and user text remains literal", () => {
  const h = harness();
  h.get("demo-input").value = "   ";
  h.get("demo-composer").fire("submit");
  assert.equal(h.get("demo-request").textContent.trim(), h.strings["demo.start.request"]);
  h.get("demo-input").value = '<img src=x onerror="alert(1)">';
  h.get("demo-composer").fire("submit");
  assert.equal(h.get("demo-habit").textContent, '<img src=x onerror="alert(1)">');
  h.switchLanguage("pt-BR");
  assert.equal(h.get("demo-habit").textContent, '<img src=x onerror="alert(1)">');
});
test("the composer is an editable form with a submit action", () => {
  const composer = nodes.find((node) => attributes(node).id === "demo-composer");
  assert.equal(composer.name, "form");
  assert.ok(nodes.some((node) => node.name === "input" && attributes(node).id === "demo-input"));
  assert.ok(nodes.some((node) => node.name === "button" && attributes(node).type === "submit"));
  assert.doesNotMatch(source, /demo-playback/);
});

test("send is filled and enabled only for a nonempty request, then resets after sending", () => {
  const h = harness();
  const input = h.get("demo-input");
  const composer = h.get("demo-composer");
  const send = composer.querySelector(".demo-send");
  for (const words of ["", "   ", "Plan a walk."]) {
    input.value = words;
    input.fire("input");
    assert.equal(send.disabled, !words.trim());
    assert.equal(Object.hasOwn(composer.attributes, "data-has-text"), Boolean(words.trim()));
  }
  composer.fire("submit");
  assert.equal(input.value, "");
  assert.equal(send.disabled, true);
  assert.equal(Object.hasOwn(composer.attributes, "data-has-text"), false);
});

for (const language of ["en", "pt-BR"]) {
  test(`${language}: editing a batch merges duplicate names before approval`, () => {
    const h = harness(language);
    h.chips[2].fire("click");
    h.get("demo-edit").fire("click");
    h.get("demo-edit-name").value = h.strings["demo.move.secondHabit"];
    h.get("demo-edit-schedule").value = "evening";
    h.get("demo-edit-form").fire("submit");
    assert.equal(h.get("demo-second").hidden, true);
    h.switchLanguage(language === "en" ? "pt-BR" : "en");
    assert.equal(h.get("demo-second").hidden, false);
    h.switchLanguage(language);
    assert.equal(h.get("demo-second").hidden, true);
    h.get("demo-approve").fire("click");
    assert.equal(h.visibleRows().length, 1);
    assert.equal(h.get("demo-today-second").hidden, true);
  });
}

for (const language of ["en", "pt-BR"]) {
  test(`${language}: the app-entry owner consumes the latest edited and accepted demo href`, () => {
    const h = harness(language);
    const link = h.get("demo-continue-link");
    assert.ok(link.hasAttribute("data-app-entry"));
    for (const [input, query] of [
      ["Walk today", "title=Walk%25252520today"],
      ["Read & reflect", "title=Read%25252520%25252526%25252520reflect"],
      [
        "emoji 👩🏽‍🚀",
        "title=emoji%25252520%252525F0%2525259F%25252591%252525A9%252525F0%2525259F%2525258F%252525BD%252525E2%25252580%2525258D%252525F0%2525259F%2525259A%25252580",
      ],
      [
        "#Intent;scheme=evil;package=evil;S.browser_fallback_url=https://evil.invalid;end",
        "title=%25252523Intent%2525253Bscheme%2525253Devil%2525253Bpackage%2525253Devil%2525253BS.browser_fallback_url%2525253Dhttps%2525253A%2525252F%2525252Fevil.invalid%2525253Bend",
      ],
    ]) {
      const title = input.trim().slice(0, 80);
      h.get("demo-edit").fire("click");
      h.get("demo-edit-name").value = input;
      h.get("demo-edit-schedule").value = "evening";
      h.get("demo-edit-form").fire("submit");
      h.get("demo-approve").fire("click");
      const destination = new URL(link.href);
      assert.equal(destination.pathname, "/habits/new");
      assert.equal(destination.searchParams.get("title"), title);
      const before = h.intents.length;
      const href = link.href;
      assert.equal(h.enter().defaultPrevented, true);
      assert.equal(h.intents.length, before + 1);
      assert.equal(link.href, href, "the accepted HTTPS destination remains unchanged");
      const [route, directives] = h.intents.at(-1).split("#Intent;");
      const app = new URL(link.dataset.appUrl);
      const staging = app.hostname === "app-staging.useorbit.org";
      const scheme = staging ? "orbit-staging" : "orbit";
      const packageName = staging ? "org.useorbit.app.staging" : "org.useorbit.app";
      const fallback =
        process.env.PUBLIC_ANDROID_INSTALL_URL ||
        "https://play.google.com/store/apps/details?id=org.useorbit.app";
      assert.equal(
        directives,
        `scheme=${scheme};package=${packageName};S.browser_fallback_url=${encodeURIComponent(fallback)};end`,
      );
      const uri = new URL(route.replace("intent:", `${scheme}:`));
      assert.equal(uri.pathname, "/habits/new");
      assert.equal(uri.search, `?${query}`);
      assert.equal(uri.hash, "");
      assert.deepEqual([...uri.searchParams.keys()], ["title"]);
      assert.equal(
        decodeURIComponent(decodeURIComponent(decodeURIComponent(uri.searchParams.get("title")))),
        title,
      );
      h.get("demo-reject").fire("click");
      assert.equal(h.get("demo-continue").hidden, true);
    }
  });
}

for (const language of ["en", "pt-BR"]) {
  test(`${language}: ignores a blank edit name`, () => {
    for (const blank of ["", "   "]) {
      const h = harness(language);
      h.get("demo-input").value =
        language === "en" ? "I want to read at night." : "Quero ler à noite.";
      h.get("demo-composer").fire("submit");
      h.get("demo-edit").fire("click");
      const title = h.get("demo-habit").textContent;
      const schedule = h.get("demo-repeat").textContent;
      const href = h.get("demo-continue-link").href;
      h.get("demo-edit-name").value = blank;
      h.get("demo-edit-schedule").value = "afternoon";
      h.get("demo-edit-form").fire("submit");
      assert.equal(h.get("demo-edit-form").hidden, false);
      assert.equal(h.get("demo-habit").textContent, title);
      assert.equal(h.get("demo-repeat").textContent, schedule);
      assert.equal(h.get("demo-continue-link").href, href);
      assert.equal(h.get("demo-continue").hidden, true);
      h.get("demo-approve").fire("click");
      assert.equal(new URL(h.get("demo-continue-link").href).searchParams.get("title"), title);
      assert.equal(h.get("demo-today-repeat").textContent, schedule);
    }
  });
}

for (const language of ["en", "pt-BR"]) {
  test(`${language}: the edit announcement names only what the person changed`, () => {
    const cases = [
      ["Evening walk", "evening", "demo.edit.both"],
      ["Evening walk", "morning", "demo.edit.name"],
      [null, "evening", "demo.edit.time"],
      [null, "morning", "demo.rejected"],
    ];
    for (const [name, time, key] of cases) {
      const h = harness(language);
      h.get("demo-edit").fire("click");
      if (name) h.get("demo-edit-name").value = name;
      h.get("demo-edit-schedule").value = time;
      h.get("demo-edit-form").fire("submit");
      assert.equal(h.get("demo-announcement").textContent, h.strings[key]);
    }
  });
}

for (const language of ["en", "pt-BR"]) {
  test(`${language}: an untouched time select keeps the schedule of the example`, () => {
    const h = harness(language);
    h.chips[1].fire("click");
    assert.equal(h.get("demo-repeat").textContent, h.strings["demo.restart.repeat"]);
    h.get("demo-edit").fire("click");
    h.get("demo-edit-form").fire("submit");
    assert.equal(h.get("demo-repeat").textContent, h.strings["demo.restart.repeat"]);
    assert.equal(h.get("demo-announcement").textContent, h.strings["demo.rejected"]);
    h.get("demo-approve").fire("click");
    assert.equal(h.get("demo-today-repeat").textContent, h.strings["demo.restart.repeat"]);
  });
}
