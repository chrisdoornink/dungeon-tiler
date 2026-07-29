// No-op stand-in for posthog-js in the standalone bundle. A recursive proxy so ANY call
// shape is a silent no-op: posthog.init(), posthog.capture(), posthog.identify(),
// posthog.people.set(), etc. Aliased in vite.config so posthog-js is dropped from the
// bundle entirely (smaller build, zero analytics network from inside the portal iframe).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noop: any = new Proxy(function () {}, {
  get: () => noop,
  apply: () => undefined,
});

export default noop;
