import { DurableObject } from 'cloudflare:workers';
import handlers from './handler.cjs';

export class YahooLookupGate extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.handle = handlers.createDurableYahooHandler({
      appId: env.YAHOO_SHOPPING_APP_ID, storage: ctx.storage, dailyLimit: env.DAILY_LOOKUP_LIMIT,
    });
  }

  fetch(request) { return this.handle(request); }
}

export default { fetch: handlers.handleYahooWorkerRequest };
