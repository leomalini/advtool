<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Never guess an identifier

Column, table, function, policy, env var, file, export — **read the source that defines it.** Never infer a name from a filename, from a convention, from another module, or from what a name "should" be. `20260101000030_clients_qualification.sql` declares `marital_status`, `rg_issuer`, `birth_date` and `tags` — and no column called `qualification`. Guessing that name turned an applied migration into a "missing" one in a verification report.

The same rule runs in reverse: **"it doesn't exist" needs proof too.** Never report absence without having actually looked.

- Before using an identifier in a query, a test or a claim about state: `grep` the file that defines it.
- Checking schema? Enumerate what's there. Don't probe a hunch and read the failure as an answer.
- A negative result (`400`, `404`, `PGRST205`, `does not exist`) is a **hypothesis**, not a finding. Confirm the probe itself was right before reporting — the bug is often in the test.
- When it can't be verified, ask. An unanswered question costs a message; a wrong fact costs the user's trust in every other fact in the report.

This matters most inside verification work, where the whole value of the output is that it can be trusted without re-checking.
