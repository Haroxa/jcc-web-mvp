import app from "../../worker";

type PagesFunctionEnv = {
  DB: D1Database;
  SCREENSHOTS?: R2Bucket;
  ADMIN_SETUP_TOKEN?: string;
};

export const onRequest: PagesFunction<PagesFunctionEnv> = (context) => {
  return app.fetch(context.request, context.env, context as unknown as ExecutionContext);
};
