"use strict";

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const cpmm = Services.cpmm;

if (cpmm) {

  Cu.reportError("EXECUTING CHILD SCRIPT!");

  class Controller {
    constructor() {
      Services.obs.addObserver(this, "http-on-opening-request");
      Services.obs.addObserver(this, "document-on-opening-request");
    }
    matchRequest(channel, filters) {
      // Log everything if no filter is specified
      if (!filters.outerWindowID && !filters.window) {
        return true;
      }

      // Ignore requests from chrome or add-on code when we are monitoring
      // content.
      // TODO: one particular test (browser_styleeditor_fetch-from-cache.js) needs
      // the flags.testing check. We will move to a better way to serve
      // its needs in bug 1167188, where this check should be removed.
      if (
        channel.loadInfo &&
        channel.loadInfo.loadingDocument === null &&
        channel.loadInfo.loadingPrincipal ===
        Services.scriptSecurityManager.getSystemPrincipal()
      ) {
        return false;
      }

      if (filters.window) {
        // Since frames support, this.window may not be the top level content
        // frame, so that we can't only compare with win.top.
        let win = this.getWindowForRequest(channel);
        while (win) {
          if (win == filters.window) {
            return true;
          }
          if (win.parent == win) {
            break;
          }
          win = win.parent;
        }
      }

      if (filters.outerWindowID) {
        const topFrame = this.getTopFrameForRequest(channel);
        // topFrame is typically null for some chrome requests like favicons
        if (topFrame) {
          try {
            if (topFrame.outerWindowID == filters.outerWindowID) {
              return true;
            }
          } catch (e) {
            // outerWindowID getter from browser.js (non-remote <xul:browser>) may
            // throw when closing a tab while resources are still loading.
          }
        }
      }

      return false;
    }

    getTopFrameForRequest(request) {
      try {
        return this.getRequestLoadContext(request).topFrameElement;
      } catch (ex) {
        // request loadContent is not always available.
      }
      return null;
    }

    getWindowForRequest(request) {
      try {
        return this.getRequestLoadContext(request).associatedWindow;
      } catch (ex) {
        // TODO: bug 802246 - getWindowForRequest() throws on b2g: there is no
        // associatedWindow property.
      }
      return null;
    }

    /**
     * Gets the nsILoadContext that is associated with request.
     *
     * @param nsIHttpChannel request
     * @returns nsILoadContext or null
     */
    getRequestLoadContext(request) {
      try {
        return request.notificationCallbacks.getInterface(Ci.nsILoadContext);
      } catch (ex) {
        // Ignore.
      }

      try {
        return request.loadGroup.notificationCallbacks.getInterface(
          Ci.nsILoadContext
        );
      } catch (ex) {
        // Ignore.
      }

      return null;
    }

    observe(subject, topic, data) {
      switch (topic) {
        case "http-on-opening-request":
        case "document-on-opening-request":
          let channel, channelId;
          try {
            channel = subject.QueryInterface(Ci.nsIHttpChannel);
            channelId = channel.channelId;
          } catch (e) {
            Cu.reportError("Couldn't access channel")
            Cu.reportError(e);
            return;
          }
          let frame = Components.stack;
          let stacktrace = [];
          if (frame && frame.caller) {
            frame = frame.caller;
            while (frame) {
              stacktrace.push(
                frame.name +
                "@" +
                frame.filename +
                ":" +
                frame.lineNumber +
                ":" +
                frame.columnNumber +
                ";" +
                frame.asyncCause
              );
              frame = frame.caller || frame.asyncCaller;
            }
          }
          if (!stacktrace.length) return;
          stacktrace = stacktrace.join("\n");
          Cu.reportError("Sending stacktrace");
          cpmm.sendAsyncMessage("openwpm-stacktrace",
            { stack:stacktrace, chanelId:channelId  },
          );
          break;
      }
      //TODO: listen to message-manager-disconnect and clean up
    }
    willDestroy() {
      Services.obs.removeObserver(this, "http-on-opening-request");
      Services.obs.removeObserver(this, "document-on-opening-request");
    }
  }
  const conttroller = new Controller();
}