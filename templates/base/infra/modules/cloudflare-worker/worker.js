const appName = "__APP_NAME__";
const product = "__PRODUCT__";

export default {
  /**
   * @param {Request} request
   * @param {{ readonly APP_ENV?: string }} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          app: appName,
          product,
          environment: env.APP_ENV,
        }),
        {
          headers: { "content-type": "application/json" },
        },
      );
    }

    return new Response(`${appName} is running.`, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
