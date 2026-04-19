sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("z.bts.buildtrack551.controller.UserManagement", {

        onInit: function () {
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("Dashboard");
        },

        onAddUser: function () {
            var oAppCtrl = this.getOwnerComponent().getRootControl().getController();
            if (oAppCtrl && oAppCtrl.onOpenUserRoleDialog) {
                oAppCtrl.onOpenUserRoleDialog();
            }
        },

        onEditUser: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sUserId = oContext.getProperty("UserId");
            
            var oAppCtrl = this.getOwnerComponent().getRootControl().getController();
            if (oAppCtrl && oAppCtrl.onOpenUserRoleUpdateDialog) {
                oAppCtrl.onOpenUserRoleUpdateDialog(sUserId);
            }
        },

        onSearchUser: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            var aFilters = [];

            if (sQuery && sQuery.trim().length > 0) {
                // Search by UserId, UserName, or Email
                aFilters.push(new Filter({
                    filters: [
                        new Filter("UserId", FilterOperator.Contains, sQuery),
                        new Filter("UserName", FilterOperator.Contains, sQuery),
                        new Filter("Email", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            var oTable = this.byId("userTable");
            var oBinding = oTable.getBinding("items");
            oBinding.filter(aFilters);
        },


        // Formatters
        formatAuthLevel: function (iLevel) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            switch (parseInt(iLevel, 10)) {
                case 0: return oBundle.getText("roleFieldEngineer") + " (0)";
                case 1: return oBundle.getText("roleLeadEngineer") + " (1)";
                case 2: return oBundle.getText("roleSupervisor") + " (2)";
                case 3: return oBundle.getText("roleInvestor") + " (3)";
                case 99: return oBundle.getText("roleSystemAdmin") + " (99)";
                default: return "Unknown (" + iLevel + ")";
            }
        },

        formatStatusText: function (sStatus) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (sStatus === "ACTIVE") return oBundle.getText("active");
            if (sStatus === "INACTIVE") return oBundle.getText("inactive");
            return sStatus;
        },

        formatStatusState: function (sStatus) {
            if (sStatus === "ACTIVE") return "Success";
            if (sStatus === "INACTIVE") return "Error";
            return "None";
        }

    });
});
