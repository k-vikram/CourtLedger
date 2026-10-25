import app from '../../worker/src/index';
import type { Bindings } from '../../worker/src/types';

export const onRequest: PagesFunction<Bindings> = (context) =>
  app.fetch(context.request, context.env, context as unknown as ExecutionContext);
