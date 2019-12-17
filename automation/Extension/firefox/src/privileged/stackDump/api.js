ChromeUtils.defineModuleGetter(this, "ExtensionCommon",
                               "resource://gre/modules/ExtensionCommon.jsm");
ChromeUtils.defineModuleGetter(this, "Services",
                               "resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyServiceGetter(
  this,
  "resProto",
  "@mozilla.org/network/protocol;1?name=resource",
  "nsISubstitutingProtocolHandler"
);

gOnStackAvailableListeners = new Set();

this.stackDump = class extends ExtensionAPI {
  getAPI(context) {
    Services.ppmm.addMessageListener("openwpm-stacktrace",
    (data) => {
      data = data.wrappedJSObject;
      gOnStackAvailableListeners.forEach((listener) => {
        listener(data, data === null);
       // listener(data.channelId, data.stacktrace);
      });
    });
    
    // So we can load a non-privileged code into a privilged context
    resProto.setSubstitution("openwpm", context.extension.rootURI);
    Services.ppmm.loadProcessScript(
        "resource://openwpm/privileged/stackDump/processscript.jsm",
        true //AllowDelayedLoad so it gets loaded in all windows that will get opened
    );

    return {
      stackDump: {
        onStackAvailable: new ExtensionCommon.EventManager({
          context: context,
          name: "stackDump.onStackAvailable",
          register: (fire) => {
            let listener = (id, data) => {
              fire.async(id, data);
            };
            gOnStackAvailableListeners.add(listener);
            return () => {
              gOnStackAvailableListeners.delete(listener);
            };
          }
        }).api(),
      },
    };
  }
};
