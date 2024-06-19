import Koa from "koa";
import Subdomain from 'koa-subdomain';
import cors from "@koa/cors";
import ChainRegistry from './chains/chainRegistry.js';
import ChainsController from './chains/chainsController.js'
import ValidatorRegistry from './validators/validatorRegistry.js';
import ValidatorsController from './validators/validatorsController.js'
import ProxyController from './proxy/proxyController.js'
import StatusController from './status/statusController.js'
import { redisClient } from "./redisClient.js";
import Router from "koa-router";
import Bugsnag from "@bugsnag/js"
import BugsnagPluginKoa from "@bugsnag/plugin-koa"

(async () => {
  const client = await redisClient();

  const port = process.env.APP_PORT || 3000;
  const app = new Koa();
  const subdomain = new Subdomain();

  if(process.env.BUGSNAG_KEY){
    Bugsnag.start({
      apiKey: process.env.BUGSNAG_KEY,
      plugins: [BugsnagPluginKoa],
      enabledReleaseStages: ['production', 'staging'],
      releaseStage: process.env.NODE_ENV
    })
    const middleware = Bugsnag.getPlugin('koa')

    // This must be the first piece of middleware in the stack.
    // It can only capture errors in downstream middleware
    app.use(middleware.requestHandler)
    app.on('error', middleware.errorHandler)
  }

  app.use(cors());

  const chainRegistry = ChainRegistry(client)
  const validatorRegistry = ValidatorRegistry(client)

  const proxyController = ProxyController(client, chainRegistry)
  const restRoutes = proxyController.routes('rest')
  const rpcRoutes = proxyController.routes('rpc')
  subdomain.use('rest', restRoutes);
  subdomain.use('rest.*', restRoutes);
  subdomain.use('rpc', rpcRoutes);
  subdomain.use('rpc.*', rpcRoutes);

  const chainsRoutes = ChainsController(chainRegistry).routes();
  const validatorsRoutes = ValidatorsController(chainRegistry, validatorRegistry).routes();
  const statusRoutes = StatusController(client, chainRegistry).routes();
  subdomain.use('chains', chainsRoutes);
  subdomain.use('chains.*', chainsRoutes);
  subdomain.use('validators', validatorsRoutes);
  subdomain.use('validators.*', validatorsRoutes);
  subdomain.use('status', statusRoutes);
  subdomain.use('status.*', statusRoutes);

  app.use(subdomain.routes());

  const router = new Router()
  router.get('/status', async (ctx, next) => {
    ctx.body = {
      status: 'ok'
    }
  });
  app.use(router.routes());

  app.listen(port);
  console.log(`listening on port ${port}`);
})();
