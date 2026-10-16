'use strict';
// Debug: exercise mail.js exactly as mint.js's sweep does, against one box.
const mail = require('./mail');

(async () => {
  const box = new mail.Mailbox('http://127.0.0.1:9700', '<your-mailtrap-inbox>', '<box-id>');
  const t0 = Date.now();
  const msgs = await box.list();
  console.log(`list: ${msgs.length} msg(s) in ${Date.now() - t0}ms`);
  const dig = await box.digest(0);
  console.log(`digest: ${dig.length} entry(ies) in ${Date.now() - t0}ms`);
  for (const m of dig) {
    console.log(`  id=${m.id} subj=${m.subject.slice(0, 40)} textLen=${(m.text || '').length} hasToken=${/token=/.test(m.text || '')}`);
  }
  const link = mail.pickVerifyLink(dig);
  console.log('pickVerifyLink ->', link);
})().catch((e) => console.error('ERR', e.message));
