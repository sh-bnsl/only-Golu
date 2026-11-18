// noon app bridge — included only in dist/only-golu.widget.html (npm run build:html).
//
// The noon app shows Golu in a WebView (its spotlight touchpoint) and talks to it
// over the "streamGateApi" message bridge. This file maps that bridge onto the
// host API in main.js (window.orbi.on / getPose / setPose / getFrame / setFrame / snapshot / pause …),
// so the app never touches Golu's internals.
//
// Golu → app (window.ReactNativeWebView.postMessage):
//   contentReady                          first frame drawn
//   openLandingPage { snapshot, pose, frame }   on a tap (not on drags or swipes);
//                                         frame = getFrame(): the whole animation at the tap
// App → Golu:
//   window.noonWidgetConfig = { skipIntro?, pose?, frame? }   set before the page loads;
//     with a frame (from a tap on another copy) it resumes at exactly that instant,
//     otherwise (or if the frame can't be used) skipIntro + pose
//   { namespace: "streamGateApi", event: "visibilityChange", result: { visible } }
//     posted to window; pauses / resumes rendering while the app hides the bot
(function () {
  const orbi = window.orbi;
  if (!orbi) return;
  const NAMESPACE = 'streamGateApi';
  const send = (event, payload = {}) => window.ReactNativeWebView?.postMessage(JSON.stringify({ namespace: NAMESPACE, event, payload }));

  const config = window.noonWidgetConfig || {};
  const resumed = !!config.frame && orbi.setFrame(config.frame);
  if (!resumed) {
    if (config.skipIntro) orbi.skipIntro();
    if (config.pose) orbi.setPose(config.pose, { instant: true });
  }

  orbi.on('ready', () => send('contentReady'));
  orbi.on('tap', () => {
    const snapshot = orbi.snapshot();                 // first: it poses the bot, so the frame below is the same instant
    send('openLandingPage', { snapshot, pose: orbi.getPose(), frame: orbi.getFrame() });
  });

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
