import express from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { query } from '../db.js';
import * as wire from '../serialize.js';
import { inspect, redeem } from '../invites.js';

/** A path parameter of a matched route is always present. */
const param = (req: Request, name: string): string => String(req.params[name]);

export const web = express.Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const asyncRoute = (fn: AsyncHandler): RequestHandler =>
  (req, res, next) => { void fn(req, res, next).catch(next); };

async function findBudget(id: string): Promise<unknown> {
  const { rows } = await query('select * from "Budgets" where "UniqueId" = $1', [id]);
  return rows.length ? wire.budget(rows[0] as never) : null;
}

/** A fresh, unsaved budget for the landing page to bind its form to. */
web.get('/', (req, res) => {
  res.render('newBudget', {
    title: res.locals.t('page.newBudget'),
    budget: { UniqueId: crypto.randomUUID(), Name: '', StartDay: 0, Amount: 0,
              StartDayOfWeek: 'Sunday' },
  });
});

web.get('/Budget/:id', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);

  // The old page showed a "bookmark this" alert on the first view after
  // creating a budget, tracked in session state. A query flag does the same
  // job without the app needing a session store at all.
  res.render('week', { title: res.locals.t('page.week'), budget, first: req.query.new === '1' });
}));

web.get('/Budget/:id/Month', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);
  res.render('month', { title: res.locals.t('page.month'), budget });
}));

web.get('/Budget/:id/Categories', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);
  res.render('categories', { title: res.locals.t('page.categories'), budget });
}));

// Required by the App Store, and linked from the landing page. No budget
// context: the reviewer opens it cold, and so does anyone curious.
web.get('/privacy', (req, res) => {
  res.render('privacy', { title: res.locals.t('privacy.title') });
});

// Reachable with or without a budget: the landing page links here before one
// exists, and the app bar has to know where "Done" goes back to.
web.get('/HowItWorks', (req, res) => {
  res.render('howItWorks', { title: res.locals.t('howItWorks.title'), budget: null });
});

web.get('/Budget/:id/HowItWorks', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);
  res.render('howItWorks', { title: res.locals.t('howItWorks.title'), budget });
}));

/*
 * The weekly-number helper: the sum the tutorial describes, done here instead
 * of in a spreadsheet. Paired with and without a budget like HowItWorks, and
 * it hands its answer to whichever form sent it — the landing page when there
 * is no budget yet, Edit budget when there is.
 */
web.get('/WeeklyNumber', (req, res) => {
  res.render('weeklyNumber', {
    title: res.locals.t('planner.title'), budget: null,
    backHref: '/', targetHref: '/',
  });
});

web.get('/Budget/:id/WeeklyNumber', asyncRoute(async (req, res) => {
  const id = param(req, 'id');
  const budget = await findBudget(id);
  if (!budget) return res.sendStatus(404);
  res.render('weeklyNumber', {
    title: res.locals.t('planner.title'), budget,
    backHref: `/Budget/${id}/Edit`, targetHref: `/Budget/${id}/Edit`,
  });
}));

// Where both phones send anyone asking about the other platform, so neither app
// has to name it — see the comment at the top of apps.ejs. Paired with and
// without a budget for the same reason as HowItWorks.
web.get('/Apps', (req, res) => {
  res.render('apps', { title: res.locals.t('apps.title'), budget: null });
});

web.get('/Budget/:id/Apps', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);
  res.render('apps', { title: res.locals.t('apps.title'), budget });
}));

// Who makes this and how to reach him. Both apps carry the same screen; this is
// the copy for people who only ever use the website, and it is the only one of
// the three that can name both stores. Paired for the same reason as above.
web.get('/About', (req, res) => {
  res.render('about', { title: res.locals.t('about.title'), budget: null });
});

web.get('/Budget/:id/About', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);
  res.render('about', { title: res.locals.t('about.title'), budget });
}));

/* --------------------------------------------------------------- deep links */

/*
 * The two association files, and the pages an invite link lands on.
 *
 * Routes rather than static files: express.static skips dotfile directories, and
 * the content type is load-bearing — Apple ignores an association served as
 * anything other than JSON, and neither file may be reached through a redirect.
 */

const APPLE_APP_ID =
  process.env.BUDGETAPP_APPLE_APP_ID ?? 'YZGA278893.com.andrewovens.weeklybudget2';
const ANDROID_PACKAGE =
  process.env.BUDGETAPP_ANDROID_PACKAGE ?? 'com.andrewovens.weeklybudget2';

/*
 * The certificate Android checks is the one the installed app was signed with,
 * which is not necessarily the one in our keystore: with Play App Signing, Play
 * re-signs the upload and its own certificate is what ships. The value below is
 * the upload key's, and it is right only if this app signs with that key
 * directly — Play Console, App integrity, "App signing key certificate", is the
 * authority. Several fingerprints are allowed, so adding Play's is additive and
 * never breaks the one already here.
 */
const ANDROID_SHA256 = (process.env.BUDGETAPP_ANDROID_SHA256
  ?? '65:37:CA:37:D9:98:34:44:64:CC:DB:E1:5A:A2:ED:9C:E0:4E:2D:CE:7E:11:99:D6:84:02:77:F8:54:D1:8A:09')
  .split(/[,\s]+/)
  .filter(Boolean);

web.get('/.well-known/apple-app-site-association', (_req, res) => {
  res.type('application/json')
     .set('Cache-Control', 'public, max-age=3600')
     .json({
       applinks: {
         details: [{
           appIDs: [APPLE_APP_ID],
           // Only the invite path. Claiming the whole domain would mean every
           // link to the site tried to open the app, including the ones whose
           // entire job is to be a web page.
           components: [{ '/': '/join/*', comment: 'invite links' }],
         }],
       },
     });
});

web.get('/.well-known/assetlinks.json', (_req, res) => {
  res.type('application/json')
     .set('Cache-Control', 'public, max-age=3600')
     .json([{
       relation: ['delegate_permission/common.handle_all_urls'],
       target: {
         namespace: 'android_app',
         package_name: ANDROID_PACKAGE,
         sha256_cert_fingerprints: ANDROID_SHA256,
       },
     }]);
});

/**
 * The page an invite link lands on. Safe, and it has to stay that way.
 *
 * Redeeming happens in the POST below and nowhere else. Every messaging client
 * fetches a shared URL to build a preview, so a GET that spent the token would
 * kill the invite before its recipient ever tapped it — which is the single most
 * likely way this feature could fail in practice.
 *
 * It also does not reveal the budget id. That id is the durable credential, and
 * a GET response containing it would hand it to every preview bot and proxy the
 * link passes through, which is the whole thing invites exist to avoid.
 */
web.get('/join/:token', asyncRoute(async (req, res) => {
  const state = await inspect(param(req, 'token'));
  joinHeaders(res);
  res.render('join', {
    title: res.locals.t('join.title'),
    budget: null,
    state: state.status,
    budgetName: state.budgetName ?? '',
    token: param(req, 'token'),
  });
}));

web.post('/join/:token', asyncRoute(async (req, res) => {
  const result = await redeem(param(req, 'token'));
  joinHeaders(res);

  if ('failed' in result) {
    return res.status(result.failed === 'missing' ? 404 : 410).render('join', {
      title: res.locals.t('join.title'),
      budget: null,
      state: result.failed,
      budgetName: '',
      token: param(req, 'token'),
    });
  }

  // 303 so the browser follows with a GET: a refresh of the result page must not
  // re-submit the form against a token that has already been spent.
  //
  // `new=1` is the same flag a freshly created budget gets, which prompts to add
  // the page to the home screen. That advice matters more here than there — the
  // URL is now this person's only handle on the budget.
  res.redirect(303, `/Budget/${result.budgetId}?new=1`);
}));

/**
 * No caching, and no Referer.
 *
 * The token is in the path, so any request this page triggers to a third party
 * would carry it in the Referer header, and a shared cache holding the page
 * would serve one person's invite to the next.
 */
function joinHeaders(res: Response): void {
  res.set('Cache-Control', 'no-store, private');
  res.set('Referrer-Policy', 'no-referrer');
}

web.get('/Budget/:id/Add', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);
  res.render('addExpense', { title: res.locals.t('addExpense.title'), budget });
}));

web.get('/Budget/:id/Edit', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);
  res.render('editBudget', { title: res.locals.t('editBudget.title'), budget });
}));

web.get('/Budget/:id/Edit/:expenseId', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);

  const { rows } = await query('select * from "Expenses" where "Id" = $1', [param(req, 'expenseId')]);
  if (!rows.length) return res.sendStatus(404);

  res.render('editExpense', {
    title: res.locals.t('editExpense.title'),
    budget,
    expense: wire.expense(rows[0] as never),
  });
}));
