/* [ARKENFOX USER.JS OVERRIDES] */
// 4520: enable WebGL
user_pref("webgl.disabled", false);

// 5510: control when to send a cross-origin referer (embed video playback fix)
user_pref("network.http.referer.XOriginPolicy", 0);

// 5021: disable location bar using search
user_pref("keyword.enabled", false);

/* [OTHER SETTINGS] */
// Customize Firefox with FirefoxCSS
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);

// Intergrated calculator at address bar
user_pref("browser.urlbar.suggest.calculator", true);
