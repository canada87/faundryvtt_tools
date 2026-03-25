import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { ImageShareSystem } from "./ImageShareSystem.mjs";

/**
 * Initialize the Image Share feature.
 * Called once during module init.
 */
export function initImageShare() {

  /* ---- ImagePopout header control (Foundry v13 ApplicationV2) ---- */
  /* Override _getHeaderControls on the prototype to inject a
     "Share Fullscreen" button next to the native "Show Players".
     Uses the documented onClick property of ApplicationHeaderControlsEntry. */

  const IPClass = globalThis.ImagePopout
    ?? foundry?.applications?.apps?.ImagePopout;

  if (IPClass) {
    const origGetHeaderControls = IPClass.prototype._getHeaderControls;
    IPClass.prototype._getHeaderControls = function () {
      const controls = origGetHeaderControls.call(this);
      if (!game.user.isGM) return controls;
      controls.push({
        action: "shareFullscreenImage",
        icon: "fas fa-expand",
        label: "IMAGE_SHARE.ShareFullscreen",
        onClick: () => {
          const imgEl = this.element?.querySelector("img, video");
          const src = imgEl?.getAttribute("src") || imgEl?.src
            || this.options?.src;
          if (!src) {
            ui.notifications.warn(game.i18n.localize("IMAGE_SHARE.Warn.NoImage"));
            return;
          }
          const title = this.options?.title || this.title || "";
          ImageShareSystem.shareFullscreen(src, title);
        }
      });
      return controls;
    };
  }

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "imageShare",
    icon: "fas fa-image",
    name: "IMAGE_SHARE.FeatureName",
    description: "IMAGE_SHARE.FeatureDescription",
    open: () => {
      if (ImageShareSystem.isSharing) {
        ImageShareSystem.stopSharing();
        return;
      }
      const fp = new FilePicker({
        type: "image",
        callback: (src) => {
          if (src) ImageShareSystem.shareFullscreen(src);
        }
      });
      fp.render(true);
    }
  });

  /* ---- Socket (needs game.socket → wait for ready) ---- */

  Hooks.once("ready", () => {
    ImageShareSystem.setupSocket();
  });

  /* ---- Public API ---- */

  game.faundryvttTools.imageShare = {
    ImageShareSystem,
    share(src, title) { ImageShareSystem.shareFullscreen(src, title); },
    stop() { ImageShareSystem.stopSharing(); }
  };

  console.log("Faundryvtt Tools | Image Share feature initialized");
}
