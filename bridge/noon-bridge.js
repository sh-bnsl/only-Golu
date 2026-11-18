// noon app bridge — included only in dist/only-golu.widget.html (npm run build:html).
//
// The noon app shows Golu in a WebView (its spotlight touchpoint) and talks to it
// over the "streamGateApi" message bridge. This file maps that bridge onto the
// host API in main.js (window.orbi.on / getPose / setPose / snapshot / pause …),
// so the app never touches Golu's internals.
//
// Golu → app (window.ReactNativeWebView.postMessage):
//   contentReady                          first frame drawn
//   openLandingPage { snapshot, pose }    on a tap (not on drags or swipes)
// App → Golu:
//   window.noonWidgetConfig = { skipIntro?, pose? }   set before the page loads
//   { namespace: "streamGateApi", event: "visibilityChange", result: { visible } }
//     posted to window; pauses / resumes rendering while the app hides the bot
(function () {
  const orbi = window.orbi;
  if (!orbi) return;
  const NAMESPACE = 'streamGateApi';
  const send = (event, payload = {}) => window.ReactNativeWebView?.postMessage(JSON.stringify({ namespace: NAMESPACE, event, payload }));

  const config = window.noonWidgetConfig || {};
  if (config.skipIntro) orbi.skipIntro();
  if (config.pose) orbi.setPose(config.pose, { instant: true });

  orbi.on('ready', () => send('contentReady'));
  orbi.on('tap', () => send('openLandingPage', { snapshot: orbi.snapshot(), pose: orbi.getPose() }));

  window.addEventListener('message', (event) => {
    let message;
    try {
      message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (message?.namespace !== NAMESPACE || message.event !== 'visibilityChange') return;
    if (message.result?.visible === false) {
      if (orbi.ready) orbi.pause();     // never before the first frame, or 'contentReady' would never come
    } else {
      orbi.resume();
    }
  });

  window.noonBridge = { send };
})();
