// The EJS templates and static files are resolved relative to the compiled
// module, so they have to sit beside it in dist/ rather than staying in src/.
import { cp } from 'node:fs/promises';

for (const dir of ['views', 'public']) {
  await cp(new URL(`../src/${dir}`, import.meta.url),
           new URL(`../dist/${dir}`, import.meta.url), { recursive: true });
  console.log(`copied ${dir}`);
}
