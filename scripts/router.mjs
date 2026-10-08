// Local integration test router. Both Go Workers share one workerd/D1 instance.
export default {
  fetch(request, env) {
    const target = request.headers.get("Host") === "admin.local" ? env.ADMIN : env.PUBLIC;
    return target.fetch(request);
  },
};
