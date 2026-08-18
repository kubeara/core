export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const assetPathByRoute = {
      "/": "/install.sh",
      "/install.sh": "/install.sh",
      "/install.ps1": "/install.ps1",
      "/uninstall.sh": "/uninstall.sh",
      "/uninstall.ps1": "/uninstall.ps1",
    };

    const assetPath = assetPathByRoute[url.pathname];
    if (!assetPath) {
      return new Response("Not found", { status: 404 });
    }

    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return new Response("ASSETS binding is not configured", { status: 500 });
    }

    const assetUrl = new URL(assetPath, url.origin);
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
};
