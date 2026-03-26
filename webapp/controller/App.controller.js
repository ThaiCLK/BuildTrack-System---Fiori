sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Fragment"
], (BaseController, Fragment) => {
  "use strict";

  return BaseController.extend("z.bts.buildtrack551.controller.App", {
      onInit() {
      },
      onNavToDashboard: function () {
          this.getOwnerComponent().getRouter().navTo("Dashboard");
      },
      onPressProfile: function (oEvent) {
          var oButton = oEvent.getSource();
          if (!this._pProfilePopover) {
              this._pProfilePopover = Fragment.load({
                  id: this.getView().getId(),
                  name: "z.bts.buildtrack551.view.fragments.ProfilePopover",
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
      },

      onLanguageSelect: function (oEvent) {
          var sKey = oEvent.getParameter("item").getKey();
          var oConfiguration = sap.ui.getCore().getConfiguration();
          
          if (oConfiguration.getLanguage() !== sKey) {
              oConfiguration.setLanguage(sKey);
              var oBundle = this.getView().getModel("i18n").getResourceBundle();
              var sMsg = oBundle.getText("languageChanged", [sKey === "vi" ? oBundle.getText("vietnamese") : oBundle.getText("english")]);
              sap.m.MessageToast.show(sMsg);
          }
      }
  });
});