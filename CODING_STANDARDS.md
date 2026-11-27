# Coding standards

The reviewer reads this file: Pullfrog and the local review. Workers do not load it. The reviewer reads it from the base branch with `git show origin/main:CODING_STANDARDS.md`, so a pull request never changes the rules that judge it.

## Contents

- How review uses this file
- Code
- Tests that lie
- Smells

## How review uses this file

1. Review has two axes, and each runs apart from the other. Standards asks "is it built right?" and reads this file. Spec asks "is it the right thing?" and reads the linked ticket. Report the two axes apart. Never merge or rerank them.
2. Every finding cites one rule id of this file, one smell name with the hunk, or one line of the ticket. A finding with no citation is not a finding.
3. Skip what a lint rule, `astro check`, a test or `tools/check-instructions.mjs` already enforces.
4. A rule of this file wins over a smell. A smell is always a judgement call.
5. Act on the findings that have a citation, then stop. Never review again and again until a review comes back clean.
6. A mechanical rule gets a deterministic check. A rule here names its check when it has one. A rule that fires on good code is deleted.

## Code

- CODE-1 Fix the root cause. Add no defensive branch for a problem that an upstream owner has.

## Tests that lie

A green check does not prove that the code is right. These tests pass while the code is wrong, so they do not count as the test that fails without a fix.

- LIE-1 Tautological test. The expected value restates the code: a constant asserted equal to the value it holds, or an expected value computed the way the code computes it. Take the expected value from an independent source: the ticket, a worked example, the design tokens of `src/styles/global.css` read through the built CSS.
- LIE-2 Structure-sensitive test. The test reads or parses a source file (`.astro`, `.css`, `.mjs`) and checks its layout, order or names. It breaks on a safe refactor and passes when the page is wrong. A test that a pull request adds or changes checks the built page in `dist/` after `npm run build`, as the `tools/*-output.test.mjs` files do, or runs the script module. A repository-wide guard that scans every file is the only exception, and it lives in `tools/`.
- LIE-3 A test that cannot fail. A mock or a stub replaces the code under test or hides its real failure modes. Mock only a system boundary: the network, the clock, randomness and browser APIs that the test runner lacks. Never mock a module of this repository in a test that a pull request adds or changes.
- LIE-4 A test that passes on the code before the fix does not prove the fix. Run it red before the fix.

## Smells

Each smell is a judgement call. Name it and quote the hunk. A rule above wins over it.

- Mysterious Name: a name that does not say what the thing does or holds. Rename it.
- Duplicated Code: the same logic shape in more than one hunk or file of the change. Extract it once.
- Feature Envy: a function that reads the data of another module more than its own. Move it to that data.
- Data Clumps: the same few fields or parameters travel together. Make them one type.
- Primitive Obsession: a string or a number stands for a domain idea. Give the idea its own small type.
- Repeated Switches: the same switch or if chain on the same value in more than one place. Use one map or one function.
- Shotgun Surgery: one logical change edits many files. Put what changes together in one module.
- Divergent Change: one module changes for several unrelated reasons. Split it.
- Speculative Generality: a parameter, a hook or an abstraction that the ticket does not need. Delete it.
- Message Chains: a long `a.b().c().d()` walk. Hide the walk behind one function.
- Middle Man: a function or module that only passes calls on. Call the target directly.
- Refused Bequest: an implementer that ignores most of what it inherits. Use composition.

The list is the smell baseline of the `/code-review` skill of Matt Pocock (MIT), after Martin Fowler, Refactoring, chapter 3. The rules above win over it.
