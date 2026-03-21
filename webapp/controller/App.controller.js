sap.ui.define([
  "sap/ui/core/mvc/Controller"
], (BaseController) => {
  "use strict";

  return BaseController.extend("z.bts.buildtrack.controller.App", {
      onInit() {
      },
      onNavToDashboard: function () {
          this.getOwnerComponent().getRouter().navTo("Dashboard");
      },
      onPressProfile: function (oEvent) {
          var oButton = oEvent.getSource();
          if (!this._pProfilePopover) {
              this._pProfilePopover = sap.ui.core.Fragment.load({
                  id: this.getView().getId(),
                  name: "z.bts.buildtrack.view.fragments.ProfilePopover",
                  controller: this
              }).then(function (oPopover) {
                  this.getView().addDependent(oPopover);
                  return oPopover;
              }.bind(this));
          }
          this._pProfilePopover.then(function (oPopover) {
              oPopover.openBy(oButton);
          });
      },
      onCloseProfile: function () {
          if (this._pProfilePopover) {
              this._pProfilePopover.then(function(oPopover){
                  oPopover.close();
              });
          }
      }
  });
});