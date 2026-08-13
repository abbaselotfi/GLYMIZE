import platformHandler from "./platform-index";

export default {
  async fetch(request: Request, env: unknown) {
    return platformHandler.fetch(request, env as never);
  },
};
