import { RuleTester } from "eslint";
import noConsole from "../eslint-rules/no-console.mjs";

new RuleTester().run("production/no-console", noConsole, {
  valid: [
    "if (import.meta.env.DEV) console.error('failure');",
    "if (import.meta.env.DEV) { console.warn('failure'); console.log('detail'); }",
    "function report() { if (import.meta.env.DEV) console.error('failure'); }",
  ],
  invalid: [
    "console.error('failure');",
    "console['log']('detail');",
    "if (import.meta.env.PROD) console.warn('failure');",
    "if (!import.meta.env.DEV) console.error('failure');",
    "if (import.meta.env.DEV) {} else { console.error('failure'); }",
    "if (import.meta.env.DEV) { setTimeout(() => console.log('detail')); }",
  ].map((code) => ({ code, errors: 1 })),
});
